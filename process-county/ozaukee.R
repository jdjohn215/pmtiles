rm(list = ls())

library(tidyverse)
library(sf)
library(mapgl)
source("helper-functions/county_last.R")
source("county-scrapers/ozaukee.R")

raw.results <- get_ozaukee(county_last("raw/aug2026", "ozaukee"))
saveRDS(raw.results, "processed/aug2026/ozaukee.rds")

unique(raw.results$office)

# countywide gubernatorial results
raw.results |>
  filter(office == "Governor",
         party %in% c("Democratic")) |>
  group_by(party, candidate) |>
  summarise(votes = sum(votes)) |>
  mutate(pct = votes/sum(votes)*100)

# ###############################################################################
wi.wards <- st_read("ltsb-wards/WI_Wards_Jan_2026.geojson")
cnty.wards <- wi.wards |>
  filter(CNTY_NAME == "Ozaukee") |>
  select(WARD_FIPS, MCD_NAME, CTV, WARDID) |>
  mutate(across(where(is.character), str_squish),
         across(where(is.character), str_to_upper))

orig.rep.units <- raw.results |>
  distinct(ward) |>
  mutate(rep_unit_id = row_number())

# Expand reporting units into individual ward IDs, padded to match WARDID format
# (4 chars: pure numeric → 0001, alphanumeric → 005A)
expand_reporting_unit <- function(ru) {
  # Fix period-as-comma typo (e.g. "4.9" → "4,9")
  ru <- str_replace_all(ru, "\\.", ",")

  segments <- str_split(ru, ",")[[1]] |> str_trim()

  wards <- c()
  for (seg in segments) {
    if (str_detect(seg, "-")) {
      bounds <- str_split(seg, "-")[[1]]
      wards <- c(wards, as.character(as.integer(bounds[1]):as.integer(bounds[2])))
    } else {
      wards <- c(wards, seg)
    }
  }

  # Pad: pure numbers to width 4, alphanumeric to 3 digits + letter
  sapply(wards, function(w) {
    if (str_detect(w, "[A-Z]")) {
      str_pad(str_extract(w, "^\\d+"), 3, "left", "0") |> paste0(str_extract(w, "[A-Z]$"))
    } else {
      str_pad(w, 4, "left", "0")
    }
  }, USE.NAMES = FALSE)
}

reporting.units.to.wards <- orig.rep.units |>
  separate(ward, into = c("MCD_NAME", "reporting_unit"), sep = "\\bWard\\b|\\bWards\\b|\\bWd\\b|\\bWds\\b|\\bW(?=\\d)") |>
  mutate(CTV = str_sub(MCD_NAME, 1, 1),
         across(where(is.character), str_squish),
         across(where(is.character), str_to_upper),
         MCD_NAME = word(MCD_NAME, 3, -1),
         MCD_NAME = str_remove(MCD_NAME, ",")) |>
  mutate(ward_id = map(reporting_unit, expand_reporting_unit)) |>
  unnest_longer(ward_id)

reporting.units.to.wards |>
  anti_join(cnty.wards)

reporting.units.polygons <- reporting.units.to.wards |>
  rename(WARDID = ward_id) |>
  inner_join(cnty.wards) |>
  st_as_sf() |>
  st_make_valid() |>
  group_by(rep_unit_id) |>
  summarise(geometry = st_union(geometry)) |>
  st_make_valid() |>
  inner_join(orig.rep.units) |>
  select(ward, rep_unit_id) |>
  st_transform(crs = 4326)

saveRDS(reporting.units.polygons, "county-rep-unit-polygons/ozaukee.rds")
# ###############################################################################