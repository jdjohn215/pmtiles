rm(list = ls())

library(tidyverse)
library(sf)
library(mapgl)

read_county <- function(county){
  inner_join(
    read_rds(paste0("processed/aug2026/", county, ".rds")),
    read_rds(paste0("county-rep-unit-polygons/", county, ".rds"))
  ) |>
    st_as_sf()
}

county.list <- c("milwaukee","dane","waukesha","brown","racine","outagamie")

all.counties <- map(.x = county.list, .f = read_county) |>
  list_rbind() |>
  tibble() |>
  st_as_sf() |>
  separate(ward, into = c("MCD_NAME", "reporting_unit"), sep = "\\bWard\\b|\\bWards\\b|\\bWd\\b|\\bWds\\b|\\bW(?=\\d)|\\bW\\b",
           remove = F) |>
  group_by(county, ward, office, party) |>
  mutate(pct = votes/sum(votes)*100) |>
  ungroup()

unique(all.counties$office)

gov <- all.counties |>
  filter(office == "Governor",
         party == "Democratic") |>
  mutate(candidate = case_when(
    candidate == "Barnes Mandela" ~ "Mandela Barnes",
    candidate == "Brennan Joel" ~ "Joel Brennan",
    candidate == "Crowley David" ~ "David Crowley",
    candidate == "Hong Francesca" ~ "Francesca Hong",
    candidate == "Hughes Missy" ~ "Missy Hughes",
    candidate == "Rodriguez Sara" ~ "Sara Rodriguez",
    candidate == "Roys Kelda" ~ "Kelda Roys",
    TRUE ~ candidate
  ))
unique(gov$candidate)
gov.mcd <- gov |>
  st_drop_geometry() |>
  filter(party == "Democratic") |>
  group_by(county, MCD_NAME, candidate) |>
  summarise(votes = sum(votes)) |>
  mutate(total_votes = sum(votes),
         pct = round(votes/total_votes*100, 1)) |>
  select(-votes) |>
  pivot_wider(names_from = candidate, values_from = pct)

ad13 <- all.counties |>
  filter(str_detect(office, "Assembly"),
         str_detect(office, "13"),
         party == "Democratic")
ad21 <- all.counties |>
  filter(str_detect(office, "Assembly"),
         str_detect(office, "21"),
         party == "Democratic")
ad61 <- all.counties |>
  filter(str_detect(office, "Assembly"),
         str_detect(office, "61"),
         party == "Democratic")
ad19 <- all.counties |>
  filter(str_detect(office, "Assembly"),
         str_detect(office, "19"),
         party == "Democratic")
ad8 <- all.counties |>
  filter(str_detect(office, "Assembly"),
         str_detect(office, "\\b8\\b"),
         party == "Democratic")
ad76 <- all.counties |>
  filter(str_detect(office, "Assembly"),
         str_detect(office, "76"),
         party == "Democratic")
cd4 <- all.counties |>
  filter(str_detect(office, "Congress"),
         str_detect(office, "4"),
         party == "Democratic")

ad13 |> st_drop_geometry() |> group_by(candidate) |> summarise(votes = sum(votes)) |> mutate(pct = votes/sum(votes)*100)
ad21 |> st_drop_geometry() |> group_by(candidate) |> summarise(votes = sum(votes)) |> mutate(pct = votes/sum(votes)*100)
ad61 |> st_drop_geometry() |> group_by(candidate) |> summarise(votes = sum(votes)) |> mutate(pct = votes/sum(votes)*100)
ad19 |> st_drop_geometry() |> group_by(candidate) |> summarise(votes = sum(votes)) |> mutate(pct = votes/sum(votes)*100)
ad8 |> st_drop_geometry() |> group_by(candidate) |> summarise(votes = sum(votes)) |> mutate(pct = votes/sum(votes)*100)
ad76 |> st_drop_geometry() |> group_by(candidate) |> summarise(votes = sum(votes)) |> mutate(pct = votes/sum(votes)*100)
cd4 |> st_drop_geometry() |> group_by(candidate) |> summarise(votes = sum(votes)) |> mutate(pct = votes/sum(votes)*100)

################################################################################

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
  df.centers <- df |>
    distinct(county, ward, geometry) |>
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
      })) |>
    st_set_geometry("circle_center") |>
    mutate(lng = st_coordinates(circle_center)[, "X"],
           lat = st_coordinates(circle_center)[, "Y"]) |>
    st_drop_geometry() |>
    select(county, ward, lng, lat)
  
  df.centers |>
    inner_join(st_drop_geometry(df)) |>
    mutate(color = unname(cc[candidate])) |>
    left_join(write_label(df)) |>
    arrange(votes)
}

create_pmtiles <- function(df, office){
  tiles.dir <- paste0("tiles/aug2026/", office)
  dir.create(tiles.dir, showWarnings = FALSE, recursive = TRUE)
  
  wards.geojson <- file.path(tiles.dir, "wards.geojson")
  candidate.votes.geojson <- file.path(tiles.dir, "candidate-votes.geojson")
  pmtiles.path <- file.path(tiles.dir, "votes.pmtiles")
  
  df |>
    distinct(rep_unit_id, ward, county, geometry) |>
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
create_pmtiles(cd4, "cd4")
create_pmtiles(ad13, "ad13")
create_pmtiles(ad19, "ad19")
create_pmtiles(ad21, "ad21")
create_pmtiles(ad61, "ad61")
create_pmtiles(ad76, "ad76")
create_pmtiles(ad8, "ad8")

################################################################################
# run the following in terminal to update the pmtiles
# # Make the script executable
# chmod +x push_tiles.sh
# 
# # Run the script whenever you want to push updates
# ./push_tiles.sh
################################################################################

################################################################################
# pmtiles.url <- "https://jdjohn215.github.io/pmtiles/tiles/aug2026/gov/votes.pmtiles"
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

maplibre(style = carto_style("positron")) |>
  fit_bounds(df, animate = FALSE) |>
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

pm.gov <- pmtiles_map("https://jdjohn215.github.io/pmtiles/tiles/aug2026/gov/votes.pmtiles", gov)
pm.cd4 <- pmtiles_map("https://jdjohn215.github.io/pmtiles/tiles/aug2026/cd4/votes.pmtiles", cd4)
pm.ad8 <- pmtiles_map("https://jdjohn215.github.io/pmtiles/tiles/aug2026/ad8/votes.pmtiles", ad8)
pm.ad13 <- pmtiles_map("https://jdjohn215.github.io/pmtiles/tiles/aug2026/ad13/votes.pmtiles", ad13)
pm.ad21 <- pmtiles_map("https://jdjohn215.github.io/pmtiles/tiles/aug2026/ad21/votes.pmtiles", ad21)
pm.ad61 <- pmtiles_map("https://jdjohn215.github.io/pmtiles/tiles/aug2026/ad61/votes.pmtiles", ad61)
pm.ad76 <- pmtiles_map("https://jdjohn215.github.io/pmtiles/tiles/aug2026/ad76/votes.pmtiles", ad76)

htmlwidgets::saveWidget(pm.gov, "pm-maps/aug2026/gov.html", selfcontained = TRUE)
htmlwidgets::saveWidget(pm.cd4, "pm-maps/aug2026/cd4.html", selfcontained = TRUE)
htmlwidgets::saveWidget(pm.ad8, "pm-maps/aug2026/ad8.html", selfcontained = TRUE)
htmlwidgets::saveWidget(pm.ad21, "pm-maps/aug2026/ad21.html", selfcontained = TRUE)
htmlwidgets::saveWidget(pm.ad61, "pm-maps/aug2026/ad61.html", selfcontained = TRUE)
htmlwidgets::saveWidget(pm.ad76, "pm-maps/aug2026/ad76.html", selfcontained = TRUE)
htmlwidgets::saveWidget(pm.ad13, "pm-maps/aug2026/ad13.html", selfcontained = TRUE)
