rm(list = ls())

library(tidyverse)
library(sf)
library(mapgl)
source("helper-functions/county_last.R")
source("county-scrapers/brown.R")

raw.results <- get_brown("https://www.browncountywi.gov/i/f/files/County-Clerk/Elections/Election%20Results/2026/August/summary%20final.pdf")
saveRDS(raw.results, "processed/aug2026/brown.rds")

unique(raw.results$office)

# countywide gubernatorial results
raw.results |>
  filter(office == "Governor",
         party %in% c("Democratic")) |>
  group_by(party, candidate) |>
  summarise(votes = sum(votes)) |>
  mutate(pct = votes/sum(votes)*100)


# ###############################################################################
# wi.wards <- st_read("ltsb-wards/WI_Wards_Jan_2026.geojson")
# cnty.wards <- wi.wards |>
#   filter(CNTY_NAME == "Brown") |>
#   select(WARD_FIPS, MCD_NAME, CTV, WARDID) |>
#   mutate(across(where(is.character), str_squish),
#          across(where(is.character), str_to_upper))
# 
# orig.rep.units <- raw.results |>
#   distinct(ward) |>
#   mutate(rep_unit_id = row_number())
# 
# # Expand reporting units into individual ward IDs, padded to match WARDID format
# # (4 chars: pure numeric → 0001, alphanumeric → 005A)
# expand_reporting_unit <- function(ru) {
#   # Fix period-as-comma typo (e.g. "4.9" → "4,9")
#   ru <- str_replace_all(ru, "\\.", ",")
# 
#   segments <- str_split(ru, ",")[[1]] |> str_trim()
# 
#   wards <- c()
#   for (seg in segments) {
#     if (str_detect(seg, "-")) {
#       bounds <- str_split(seg, "-")[[1]]
#       wards <- c(wards, as.character(as.integer(bounds[1]):as.integer(bounds[2])))
#     } else {
#       wards <- c(wards, seg)
#     }
#   }
# 
#   # Pad: pure numbers to width 4, alphanumeric to 3 digits + letter
#   sapply(wards, function(w) {
#     if (str_detect(w, "[A-Z]")) {
#       str_pad(str_extract(w, "^\\d+"), 3, "left", "0") |> paste0(str_extract(w, "[A-Z]$"))
#     } else {
#       str_pad(w, 4, "left", "0")
#     }
#   }, USE.NAMES = FALSE)
# }
# 
# reporting.units.to.wards <- orig.rep.units |>
#   separate(ward, into = c("MCD_NAME", "reporting_unit"), sep = "\\bWard\\b|\\bWards\\b|\\bWd\\b|\\bWds\\b|\\bW(?=\\d)") |>
#   mutate(CTV = str_sub(MCD_NAME, 1, 1),
#          across(where(is.character), str_squish),
#          across(where(is.character), str_to_upper),
#          MCD_NAME = word(MCD_NAME, 3, -1)) |>
#   mutate(ward_id = map(reporting_unit, expand_reporting_unit)) |>
#   unnest_longer(ward_id)
# 
# reporting.units.to.wards |>
#   anti_join(cnty.wards)
# 
# reporting.units.polygons <- reporting.units.to.wards |>
#   rename(WARDID = ward_id) |>
#   inner_join(cnty.wards) |>
#   st_as_sf() |>
#   st_make_valid() |>
#   group_by(rep_unit_id) |>
#   summarise(geometry = st_union(geometry)) |>
#   st_make_valid() |>
#   inner_join(orig.rep.units) |>
#   select(ward, rep_unit_id) |>
#   st_transform(crs = 4326)
# 
# saveRDS(reporting.units.polygons, "county-rep-unit-polygons/brown.rds")
# ###############################################################################

################################################################################
rep.unit.polygons <- read_rds("county-rep-unit-polygons/brown.rds") |>
  mutate(
    circle_center = local({
      circ <- geometry |>
        st_transform(3070) |>
        st_inscribed_circle(nQuadSegs = 0)
      # first vertex of each 2-point LINESTRING is the circle's center
      coords <- st_coordinates(circ)
      centers <- coords[!duplicated(coords[, "L1"]), c("X", "Y"), drop = FALSE]
      st_sfc(lapply(seq_len(nrow(centers)), \(i) st_point(centers[i, ])), crs = 3070) |>
        st_transform(4326)
    })
  )

map.results <- raw.results |>
  group_by(ward) |>
  mutate(total_votes = sum(votes),
         pct = votes/total_votes*100) |>
  ungroup()

gov <- map.results |>
  filter(office == "Governor",
         party == "Democratic")

# Per-ward popup, shared across every candidate's circle for that ward: a
# small HTML table of votes & vote share for each of the plotted candidates,
# titled with the ward name & contest
write_label <- function(df){
  df |>
    group_by(ward) |>
    summarise(
      popup = local({
        rows <- paste0(
          "<tr><td style='padding-right:8px;'>", candidate, "</td>",
          "<td style='text-align:right;padding-right:8px;'>", votes, "</td>",
          "<td style='text-align:right;'>", sprintf("%.1f%%", pct), "</td></tr>"
        )
        paste0(
          "<div><strong>", first(ward), "</strong>",
          "<div><strong>", first(office), "</strong>",
          "<table style='border-collapse:collapse;margin-top:4px;'>",
          "<tr><th></th><th style='text-align:right;padding-right:8px;'>Votes</th>",
          "<th style='text-align:right;'>Percent</th></tr>",
          paste(rows, collapse = ""),
          "</table></div>"
        )
      }),
      .groups = "drop"
    )
}

candidate_colors <- function(df){
  candidates <- unique(df$candidate)
  colors <- RColorBrewer::brewer.pal(length(candidates),"Set1")
  names(colors) <- candidates
  colors
}

# Long-format table, one row per reporting-unit/candidate combination, so
# that markers can be added to the map in a single call ordered by vote
# count. Because later-added markers render on top, sorting ascending by
# votes guarantees that -- regardless of which layers are toggled on --
# the visible candidate with the most votes in a given ward is always
# drawn last, i.e. on top of the others.
candidate_votes <- function(df){
  cc <- candidate_colors(df)
  rep.unit.polygons |>
    st_set_geometry("circle_center") |>
    mutate(lng = st_coordinates(circle_center)[, "X"],
           lat = st_coordinates(circle_center)[, "Y"]) |>
    st_drop_geometry() |>
    select(ward, lng, lat) |>
    inner_join(df) |>
    mutate(color = unname(cc[candidate])) |>
    left_join(write_label(df)) |>
    arrange(votes)
}

create_pmtiles <- function(df, office){
  tiles.dir <- paste0("tiles/brown/", office)
  dir.create(tiles.dir, showWarnings = FALSE, recursive = TRUE)
  
  wards.geojson <- file.path(tiles.dir, "wards.geojson")
  candidate.votes.geojson <- file.path(tiles.dir, "candidate-votes.geojson")
  pmtiles.path <- file.path(tiles.dir, "votes.pmtiles")
  
  rep.unit.polygons |>
    inner_join(df) |>
    select(rep_unit_id, ward, county) |>
    st_write(wards.geojson, delete_dsn = file.exists(wards.geojson), quiet = TRUE)
  
  candidate_votes(df) |>
    select(ward, candidate, votes, color, popup, lng, lat) |>
    st_as_sf(coords = c("lng", "lat"), crs = 4326) |>
    st_write(candidate.votes.geojson, delete_dsn = file.exists(candidate.votes.geojson), quiet = TRUE)
  
  # One archive, two layers: `wards` (ward boundaries) and `candidate_votes`
  # (one point per ward/candidate). -r1, --no-tile-size-limit, and
  # --no-feature-limit disable tippecanoe's density-based feature dropping,
  # which matters here because all 7 candidates' points for a given ward sit
  # at the exact same coordinates -- dropping some but not others at low zoom
  # would silently break the "leader is always on top" guarantee below.
  system2(
    "tippecanoe",
    args = c(
      "--force", "-o", pmtiles.path,
      "-Z0", "-z14", "-r1",
      "--no-tile-size-limit", "--no-feature-limit",
      "-L", paste0("wards:", wards.geojson),
      "-L", paste0("candidate_votes:", candidate.votes.geojson)
    )
  )
}
create_pmtiles(gov, "gov")
################################################################################
# run the following in terminal to update the pmtiles
# # Make the script executable
# chmod +x push_tiles.sh
# 
# # Run the script whenever you want to push updates
# ./push_tiles.sh
################################################################################

# pmtiles.url <- "https://jdjohn215.github.io/pmtiles/tiles/milwaukee/gov/votes.pmtiles"
pmtiles_map <- function(pmpath, df){
  # Candidate -> color lookup, also defines the display order used for the
  # legend/layers control (not the map z-order -- that's controlled below by
  # sorting on vote count, so that whichever visible candidate wins a given
  # ward is always drawn last, i.e. on top).
  candidate.colors <- candidate_colors(df)
  candidate.labels <- names(candidate.colors)
  default.visible <- candidate.labels
  
  # Checkbox + color-swatch control that serves as both legend and layer
  # toggle. All candidates share a single circle layer (see
  # add_circle_layer() below) with circle_sort_key on vote count, so -- unlike
  # mapgl's built-in add_layers_control(), which toggles whole layers with a
  # fixed draw order -- the leader among whichever candidates are currently
  # checked is always drawn on top, in every ward, for every combination of
  # toggled candidates.
  candidate.order <- names(candidate.colors)
  toggle.html <- paste0(
    "<div id='candidate-toggle' style='background:white;padding:8px 10px;",
    "font-family:sans-serif;font-size:13px;border-radius:4px;",
    "box-shadow:0 1px 4px rgba(0,0,0,0.3);'>",
    "<div style='font-weight:bold;margin-bottom:4px;'>Candidate</div>",
    paste0(
      "<label style='display:flex;align-items:center;gap:5px;margin-bottom:2px;cursor:pointer;'>",
      "<input type='checkbox' class='candidate-check' value='", candidate.order, "'",
      ifelse(candidate.order %in% default.visible, " checked", ""), ">",
      "<span style='display:inline-block;width:10px;height:10px;border-radius:50%;",
      "background:", candidate.colors[candidate.order], ";'></span>",
      candidate.labels,
      "</label>",
      collapse = ""
    ),
    "</div>"
  )
  
  # Wires the checkboxes up to the single shared layer's filter. `el.map` is
  # set by mapgl's JS binding once the map instance exists; wiring is
  # deferred to the map's `idle` event so the layer is guaranteed to exist.
  toggle.js <- "
function(el, x) {
  var map = el.map;
  function wire() {
    var boxes = el.querySelectorAll('#candidate-toggle .candidate-check');
    function updateFilter() {
      var active = [];
      boxes.forEach(function(b) { if (b.checked) active.push(b.value); });
      map.setFilter('candidate-votes', ['in', ['get', 'candidate'], ['literal', active]]);
    }
    boxes.forEach(function(b) { b.addEventListener('change', updateFilter); });
  }
  if (map.isStyleLoaded && map.isStyleLoaded()) { wire(); } else { map.once('idle', wire); }
}
"

cnty.shp <- tigris::counties(cb = T) |> filter(GEOID == 55009) |> st_transform(crs = 4326)

maplibre(style = carto_style("positron")) |>
  fit_bounds(cnty.shp, animate = FALSE) |>
  add_pmtiles_source(id = "votes-src", url = pmpath) |>
  add_line_layer(
    id = "ward-outline",
    source = "votes-src",
    source_layer = "wards",
    line_color = "black",
    line_width = 1
  ) |>
  add_circle_layer(
    id = "candidate-votes",
    source = "votes-src",
    source_layer = "candidate_votes",
    circle_radius = list("sqrt", get_column("votes")),
    circle_color = get_column("color"),
    circle_opacity = 1,
    circle_sort_key = get_column("votes"),
    tooltip = "popup",
    popup = "popup",
    filter = list("in", list("get", "candidate"), list("literal", default.visible))
  ) |>
  add_control(html = toggle.html, position = "top-left", id = "candidate-toggle-control") |>
  htmlwidgets::onRender(toggle.js)
}

pm.gov <- pmtiles_map("https://jdjohn215.github.io/pmtiles/tiles/brown/gov/votes.pmtiles", gov)

htmlwidgets::saveWidget(pm.gov, "pm-maps/brown/gov.html", selfcontained = TRUE)
