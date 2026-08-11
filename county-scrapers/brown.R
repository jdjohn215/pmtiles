get_brown <- function(url) {
  library(pdftools)
  library(tidyverse)

  tmp <- tempfile(fileext = ".pdf")
  download.file(url, tmp, mode = "wb", quiet = TRUE)
  on.exit(unlink(tmp))

  pages <- pdf_data(tmp)

  map(pages, parse_brown_page) |>
    list_rbind() |>
    distinct() |>
    clean_brown_results()
}

# Party code lookup
party_lookup <- c(

  DEM = "Democratic", REP = "Republican", CON = "Constitution",
  LIB = "Libertarian", WGR = "Wisconsin Green", WIG = "Wisconsin Green",
  IND = "Independent", GRN = "Green", NP = "Nonpartisan"
)

parse_brown_page <- function(pg) {
  # Find non-rotated "VOTE" text (part of "VOTE FOR N" headers)
  vote_markers <- pg |> filter(text == "VOTE", width > 7, height < 10)
  if (nrow(vote_markers) == 0) return(tibble())

  vote_for_y <- min(vote_markers$y)

  # Find ward data rows below VOTE FOR
  ward_rows <- pg |>
    filter(text %in% c("Town", "Village", "City"), y > vote_for_y, width > 7)
  if (nrow(ward_rows) == 0) return(tibble())

  data_ys <- sort(unique(ward_rows$y))
  first_data_y <- min(data_ys)

  # Column headers: width==7 text between VOTE FOR and first data row
  headers <- pg |> filter(width == 7, y > vote_for_y, y < first_data_y)
  if (nrow(headers) == 0) return(tibble())

  # Cluster headers by x position (12px tolerance)
  unique_xs <- sort(unique(headers$x))
  x_groups <- cumsum(c(TRUE, diff(unique_xs) > 12))
  x_map <- tibble(x = unique_xs, col_group = x_groups)
  headers <- headers |> left_join(x_map, by = "x")

  # Reconstruct column labels (sort words by y within each group)
  col_info <- headers |>
    group_by(col_group) |>
    summarise(
      x_mid = median(x),
      label = paste(text[order(-x, y)], collapse = " "),
      .groups = "drop"
    ) |>
    arrange(x_mid)

  # Classify columns
  col_info <- col_info |>
    mutate(
      col_type = case_when(
        str_detect(label, regex("write.?in", ignore_case = TRUE)) ~ "writein",
        str_detect(label, regex("total.*votes|votes.*cast|^cast$", ignore_case = TRUE)) ~ "skip",
        str_detect(label, regex("overvotes", ignore_case = TRUE)) ~ "skip",
        str_detect(label, regex("undervotes", ignore_case = TRUE)) ~ "skip",
        str_detect(label, regex("contest", ignore_case = TRUE)) ~ "contest_total",
        TRUE ~ "candidate"
      )
    )

  # Split into races at contest_total boundaries
  ct_idx <- which(col_info$col_type == "contest_total")
  if (length(ct_idx) == 0) return(tibble())

  n_races <- length(ct_idx)
  race_starts <- c(1L, ct_idx[-n_races] + 1L)
  race_ends <- ct_idx

  # Find race names: non-rotated text between report header and VOTE FOR
  race_names <- find_brown_race_names(pg, vote_for_y, col_info, race_starts,
                                       race_ends, n_races)

  # Parse each data row
  first_col_x <- col_info$x_mid[1]
  n_cols <- nrow(col_info)

  pmap(list(race_start = race_starts, race_end = race_ends,
            race_name = race_names), function(race_start, race_end, race_name) {
    race_cols <- col_info[race_start:race_end, ]

    map(data_ys, function(dy) {
      row_words <- pg |> filter(y == dy)

      # Ward name: text to the left of first data column
      ward_words <- row_words |> filter(x < first_col_x - 10) |> arrange(x)
      ward_name <- paste(ward_words$text, collapse = " ")
      if (ward_name == "" || str_detect(ward_name, "^Totals$")) return(tibble())

      # Vote values in this row (all numeric words, sorted by x)
      vote_vals <- row_words |>
        filter(x >= first_col_x - 30) |>
        mutate(value = as.integer(str_remove_all(text, ","))) |>
        filter(!is.na(value)) |>
        arrange(x)

      if (nrow(vote_vals) != n_cols) return(tibble())

      # Extract votes for this race's columns
      race_votes <- vote_vals$value[race_start:race_end]

      # Build rows for candidates + write-in only
      keep <- race_cols$col_type %in% c("candidate", "writein")
      tibble(
        ward = ward_name,
        office = race_name,
        candidate_raw = ifelse(race_cols$col_type[keep] == "writein",
                               "write-in:", race_cols$label[keep]),
        votes = race_votes[keep]
      )
    }) |> list_rbind()
  }) |> list_rbind()
}

find_brown_race_names <- function(pg, vote_for_y, col_info, race_starts,
                                   race_ends, n_races) {
  # Race names can span 1-2 lines above VOTE FOR (offset ~14px per line)
  race_words <- pg |>
    filter(y > vote_for_y - 30, y < vote_for_y,
           width > 2, height >= 9, height < 13) |>
    arrange(x)

  if (nrow(race_words) == 0) return(rep("Unknown", n_races))

  if (n_races == 1) {
    race_words <- race_words |> arrange(y, x)
    return(paste(race_words$text, collapse = " "))
  }

  # Multi-race: assign each word to the race whose contest_total column

  # is the first one at or beyond the word's x position
  ct_xs <- col_info$x_mid[race_ends]
  race_words <- race_words |>
    mutate(race_idx = map_int(x, function(wx) {
      idx <- which(ct_xs >= wx)
      if (length(idx) == 0) n_races else min(idx)
    }))

  map_chr(seq_len(n_races), function(r) {
    words <- race_words |> filter(race_idx == r) |> arrange(y, x)
    paste(words$text, collapse = " ")
  })
}

clean_brown_results <- function(df) {
  if (nrow(df) == 0) return(tibble(
    county = character(), ward = character(), office = character(),
    party = character(), candidate = character(), votes = integer()
  ))

  party_codes <- paste0("^(", paste(names(party_lookup), collapse = "|"), ")\\s+")

  df |>
    mutate(
      # Extract party from candidate name (general elections)
      cand_party_code = str_extract(candidate_raw, paste0("^(", paste(names(party_lookup), collapse = "|"), ")(?=\\s)")),
      # Extract party from office name (primaries)
      office_party_code = str_extract(office, paste0("^(", paste(names(party_lookup), collapse = "|"), ")(?=\\s)")),
      # Determine party
      party = case_when(
        !is.na(cand_party_code)   ~ unname(party_lookup[cand_party_code]),
        !is.na(office_party_code) ~ unname(party_lookup[office_party_code]),
        TRUE                      ~ "Nonpartisan"
      ),
      # Strip party prefix from candidate name
      candidate = str_remove(candidate_raw, party_codes) |> str_trim(),
      # Strip party prefix from office name
      office = str_remove(office, party_codes) |> str_trim(),
      # Handle write-in party: inherit from race party in primaries
      party = if_else(
        candidate == "write-in:" & !is.na(office_party_code),
        unname(party_lookup[office_party_code]),
        party
      ),
      county = "BROWN",
      votes = as.integer(votes)
    ) |>
    select(county, ward, office, party, candidate, votes)
}
