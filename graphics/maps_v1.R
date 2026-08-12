rm(list = ls())

library(tidyverse)
library(sf)
library(patchwork)

gov <- read_rds("processed/aug2026/gov.rds")
gov.mcd <- gov |>
  st_drop_geometry() |>
  filter(party == "Democratic") |>
  group_by(county, MCD_NAME, candidate) |>
  summarise(votes = sum(votes)) |>
  mutate(total_votes = sum(votes),
         pct = round(votes/total_votes*100, 1)) |>
  select(-votes) |>
  pivot_wider(names_from = candidate, values_from = pct)

mke.gov <- gov |>
  filter(county %in% c("MILWAUKEE", "WAUKESHA", "OZAUKEE", "WASHINGTON", "RACINE"))

mke.gov.winner <- mke.gov |>
  group_by(county, ward) |>
  mutate(pct = votes/sum(votes)*100) |>
  slice_max(order_by = votes, n = 1, with_ties = F) |>
  filter(ward != "City of Racine, Ward 52")
table(mke.gov.winner$candidate)

mke.gov |>
  st_drop_geometry() |>
  group_by(candidate) |>
  summarise(votes = sum(votes))

# --- Map: winner by ward, shaded by victory pct ---
# Hong = shades of purple, Crowley = shades of green
pct_min <- min(mke.gov.winner$pct, na.rm = TRUE)
pct_max <- max(mke.gov.winner$pct, na.rm = TRUE)

mke.gov.winner |>
  filter(county == "MILWAUKEE") |>
  mutate(
    pct_scaled = (pct - pct_min) / (pct_max - pct_min),
    fill = case_when(
      is.na(pct) ~ "grey85",
      candidate == "Francesca Hong" ~
        colorRampPalette(c("#E8D5F5", "#4A0E6B"))(100)[max(1L, as.integer(pct_scaled * 99) + 1)],
      candidate == "David Crowley" ~
        colorRampPalette(c("#D5F5D5", "#0B5D1E"))(100)[max(1L, as.integer(pct_scaled * 99) + 1)],
    )
  ) |>
  ggplot() +
  geom_sf(aes(fill = fill), color = "white", linewidth = 0.1) +
  scale_fill_identity() +
  theme_void() +
  labs(
    title = "2026 Gubernatorial Primary — Winner by Ward",
    subtitle = "Milwaukee area counties \u2022 Hong (purple) vs. Crowley (green)"
  )

#################################################################
exec.20 <- read_rds("/Users/john/Downloads/MilwaukeeCountyElectionResults.rds") |>
  rename(reporting_unit_id = ward_number) |>
  filter(race == "Milwaukee County Executive") |>
  inner_join(read_rds("/Users/john/Downloads/MilwaukeeCountyReportingUnitBoundariesJan2020.rds")) |>
  st_as_sf() |>
  filter(vote_choice %in% c("chris_larson","david_crowley","write_in")) |>
  select(ward_name, vote_choice, votes) |>
  group_by(ward_name) |>
  mutate(pct = votes/sum(votes)*100) |>
  ungroup() |>
  mutate(municipality = word(ward_name, 1, sep = " Ward"))

mcd.compare <- exec.20 |>
  st_drop_geometry() |>
  group_by(municipality, vote_choice) |>
  summarise(votes = sum(votes)) |>
  mutate(pct = votes/sum(votes)*100) |>
  select(-votes) |>
  ungroup() |>
  pivot_wider(names_from = vote_choice, values_from = pct) |>
  arrange(david_crowley) |>
  mutate(crowley_minus_larson = david_crowley - chris_larson) |>
  select(muni = municipality, crowley_2020 = david_crowley, crowley_minus_larson) |>
  mutate(muni = str_remove(muni, "C[.]|City of|V[.]|Village of"),
         muni = str_squish(muni)) |>
  full_join(
    gov.mcd |>
      ungroup() |>
      filter(county == "MILWAUKEE") |>
      mutate(crowley_minus_hong = `David Crowley` - `Francesca Hong`) |>
      select(muni = MCD_NAME, crowley_2026 = `David Crowley`, crowley_minus_hong) |>
      mutate(muni = str_remove(muni, "C[.]|City of|V[.]|Village of"),
             muni = str_squish(muni))
  )

exec.20 |> st_drop_geometry() |> group_by(vote_choice) |> summarise(votes = sum(votes)) |> mutate(pct = votes/sum(votes)*100)
gov |> filter(county == "MILWAUKEE") |> st_drop_geometry() |> group_by(candidate) |> summarise(votes = sum(votes)) |> mutate(pct = votes/sum(votes)*100)

mke.winner.20 <- exec.20 |>
  group_by(ward_name) |>
  slice_max(order_by = votes, n = 1, with_ties = F) |>
  mutate(vote_choice = if_else(vote_choice == "chris_larson", "Larson 49.5%", "Crowley 50.1%")) |>
  ggplot() +
  geom_sf(aes(fill = vote_choice)) +
  scale_fill_manual(values = c("#7570b3","#1b9e77")) +
  labs(fill = "Winner",
       title = "2020 County Exec.") +
  theme_void()

mke.winner.26 <- gov |>
  filter(county == "MILWAUKEE") |>
  group_by(ward) |>
  slice_max(order_by = votes, n = 1, with_ties = F) |>
  mutate(candidate = if_else(candidate == "David Crowley", "Crowley 43.0%", paste(word(candidate, -1), "41.5%"))) |>
  ggplot() +
  geom_sf(aes(fill = candidate)) +
  scale_fill_manual(values = c("#7570b3","#1b9e77")) +
  labs(title = "2026 Gov. Primary",
       fill = "Winner") +
  theme_void()
library(patchwork)
(mke.winner.20 | mke.winner.26) +
  plot_annotation(title = "David Crowley's Two Biggest Victories were Delivered by Similar Coalitions",
                  theme = theme(plot.title.position = "plot",
                                plot.title = element_text(face = "bold", size = 14)))
ggsave("graphics/crowley-2020-vs-2026.png", width = 8)

mcd.compare |>
  ggplot(aes(crowley_2020, crowley_2026)) +
  geom_point() +
  ggrepel::geom_text_repel(aes(label = muni), min.segment.length = 0) +
  scale_x_continuous(limits = c(30,60), breaks = seq(30,60,5), labels = scales::percent_format(scale = 1)) +
  scale_y_continuous(limits = c(30,60), breaks = seq(30,60,5), labels = scales::percent_format(scale = 1)) +
  labs(title = "Crowley's Vote Share in 2026 Echoed His Share in 2020",
       subtitle = "Results of the 2020 County Executive Race Compared with the 2026 Gubernatorial Primary",
       x = "Crowley % (2020 County Executive Race",
       y = "Crowley % (2026 Gubernatorial Primary)") +
  theme_bw() +
  theme(plot.title.position = "plot",
        plot.title = element_text(face = "bold", size = 14))
mcd.compare |>
  ggplot(aes(crowley_minus_larson, crowley_minus_hong)) +
  geom_abline(slope = 1, intercept = 0, linetype = "dashed") +
  geom_point() +
  ggrepel::geom_text_repel(aes(label = muni), min.segment.length = 0) +
  scale_x_continuous(limits = c(-30,30), breaks = seq(-30,30,5)) +
  scale_y_continuous(limits = c(-30,30), breaks = seq(-30,30,5)) +
  labs(title = "Crowley's Vote Share in 2026 Echoed His Share in 2020",
       subtitle = "Results of the 2020 County Executive Race Compared with the 2026 Gubernatorial Primary",
       x = "Crowley % minus Larson % (2020)",
       y = "Crowley % minus Hong % (2026)") +
  theme_bw() +
  theme(plot.title.position = "plot",
        plot.title = element_text(face = "bold", size = 14))
ggsave("graphics/crowley-2020-vs-2026_muni-scatter.png", width = 8)
