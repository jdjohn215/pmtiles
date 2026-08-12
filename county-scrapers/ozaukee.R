#' @title Retrieve ward-level election results from Ozaukee County
#'
#' @description
#' Parses an Ozaukee County SOVC (Statement of Votes Cast) PDF and returns
#' ward-level returns in a standardized long format.
#'
#' Ozaukee County publishes election results as multi-page PDF canvass
#' reports using the same SOVC layout as Washington and Racine Counties:
#' rotated column headers and candidate columns spread across consecutive
#' pages.  The report uses a left/right page layout where the left side
#' contains turnout statistics (Registered Voters, Times Cast) and the
#' right side contains candidate vote counts.  Continuation pages for
#' races with two candidates place Write-in results on the left side.
#'
#' The function handles partisan and nonpartisan general elections and
#' partisan and nonpartisan primaries.
#'
#' @param url A URL to an Ozaukee County SOVC PDF, or a local file path.
#' @return A [tibble::tibble] with columns:
#'   `county`, `ward`, `office`, `party`, `candidate`, `votes`.
#'
#' @examples
#' \dontrun{
#' get_ozaukee("raw/aug2026/ozaukee 2026-08-11 23-09-36.pdf")
#' }
get_ozaukee <- function(url) {
  library(pdftools)
  library(tidyverse)

  if (startsWith(url, "http")) {
    tmp <- tempfile(fileext = ".pdf")
    download.file(url, tmp, mode = "wb", quiet = TRUE)
    on.exit(unlink(tmp))
    pdf_path <- tmp
  } else {
    pdf_path <- url
  }

  pages <- pdf_data(pdf_path)

  race_info <- find_ozaukee_races(pages)

  map(seq_len(nrow(race_info)), function(i) {
    start <- race_info$page[i]
    end <- if (i < nrow(race_info)) race_info$page[i + 1] - 1 else length(pages)
    parse_ozaukee_race(pages, start, end, race_info$race[i])
  }) |> list_rbind() |>
    clean_ozaukee_results()
}


# Party code lookup (shared with Washington/Racine/Brown counties)
ozaukee_party_lookup <- c(
  DEM = "Democratic", REP = "Republican", CON = "Constitution",
  LIB = "Libertarian", WGR = "Wisconsin Green", WIG = "Wisconsin Green",
  IND = "Independent", GRN = "Green", NP = "Nonpartisan"
)


#' Find all race start pages by locating "Vote for" text at height 13, y=36
#'
#' The race name is always at y=36 with height=13.  Filtering on y=36
#' avoids picking up candidate-name text that can also have height=13.
find_ozaukee_races <- function(pages) {
  map(seq_along(pages), function(i) {
    pg <- pages[[i]]
    race_text <- pg |> filter(height == 13, y == 36) |> arrange(x)
    if (nrow(race_text) == 0) return(NULL)
    txt <- paste(race_text$text, collapse = " ")
    if (!str_detect(txt, "Vote for")) return(NULL)
    tibble(page = i, race = txt)
  }) |> compact() |> list_rbind()
}


#' Parse all pages of a single race
parse_ozaukee_race <- function(pages, start, end, race_name) {
  # Skip "Party Preference" — not a real office
  if (str_detect(race_name, "^Party Preference")) return(tibble())

  # Strip "(Vote for N)" suffix
  race_name <- str_remove(race_name, "\\s*\\(Vote for \\d+\\)\\s*$")

  map(start:end, function(p) {
    parse_ozaukee_page(pages[[p]], race_name)
  }) |> list_rbind()
}


#' Parse a single page: extract rotated column headers, precinct rows, and data
#'
#' The page has a left/right layout:
#' - Left side: turnout statistics (Registered Voters, Times Cast) — skipped.
#'   On continuation pages, Write-in and Total Votes appear here instead.
#' - Right side: candidate vote counts and percentages.
#'
#' Each "Precinct" header defines a section.  The function processes each
#' section independently, keeping only candidate and write-in columns.
parse_ozaukee_page <- function(pg, race_name) {
  # Find all "Precinct" headers (1 or 2 per page)
  prec_filtered <- pg |> filter(text == "Precinct")
  if (nrow(prec_filtered) == 0) return(tibble())

  map(seq_len(nrow(prec_filtered)), function(i) {
    prec_x <- prec_filtered$x[i]
    prec_y <- prec_filtered$y[i]

    # Determine section boundaries from the Precinct header x position
    is_right <- prec_x >= 380

    if (is_right) {
      header_x_min   <- 380
      header_x_max   <- Inf
      ward_name_xmin <- 399
      ward_name_xmax <- 540
    } else {
      header_x_min   <- 150
      header_x_max   <- 380
      ward_name_xmin <- 0
      ward_name_xmax <- 150
    }

    # --- Rotated column headers (width=7, height >= 10, above Precinct) ---
    headers <- pg |> filter(
      width == 7, height >= 10, y < prec_y,
      x >= header_x_min, x < header_x_max
    )
    if (nrow(headers) == 0) return(tibble())

    # Cluster headers by x position (15px tolerance)
    headers <- headers |> arrange(x)
    unique_xs <- sort(unique(headers$x))
    x_groups <- cumsum(c(TRUE, diff(unique_xs) > 15))
    x_map <- tibble(x = unique_xs, col_group = x_groups)
    headers <- headers |> left_join(x_map, by = "x")

    # Reconstruct column labels: sort by (x, -y) within each cluster
    # (counter-clockwise rotation: x ascending = top-to-bottom, y descending
    # = left-to-right)
    col_info <- headers |>
      group_by(col_group) |>
      summarise(
        x_min = min(x),
        label = paste(text[order(x, -y)], collapse = " "),
        .groups = "drop"
      ) |>
      arrange(x_min)

    # Find data right-edge for each column (most common x+width below Precinct)
    col_info <- col_info |>
      mutate(
        data_right = map_dbl(x_min, function(hx) {
          nearby <- pg |>
            filter(
              y > prec_y,
              str_detect(text, "^[\\d,]+$"),
              x + width >= hx,
              x + width <= hx + 40
            ) |>
            mutate(right = x + width) |>
            count(right, sort = TRUE)
          if (nrow(nearby) == 0) return(NA_real_)
          nearby$right[1]
        })
      ) |>
      filter(!is.na(data_right))

    # Classify columns
    col_info <- col_info |>
      mutate(
        col_type = case_when(
          str_detect(label, regex("\\bcast\\b|\\bregistered\\b|\\bvoters\\b", ignore_case = TRUE)) ~ "skip",
          str_detect(label, regex("\\btotal\\b", ignore_case = TRUE)) ~ "skip",
          str_detect(label, regex("write", ignore_case = TRUE)) ~ "writein",
          TRUE ~ "candidate"
        )
      ) |>
      filter(col_type != "skip")

    if (nrow(col_info) == 0) return(tibble())

    # --- Precinct rows (starts with Town/Village/City, below Precinct) ---
    if (is_right) {
      precinct_ys <- pg |>
        filter(x >= 399, x < 540, text %in% c("Town", "Village", "City"), y > prec_y) |>
        pull(y) |>
        sort()
    } else {
      precinct_ys <- pg |>
        filter(x < 30, text %in% c("Town", "Village", "City"), y > prec_y) |>
        pull(y) |>
        sort()
    }

    if (length(precinct_ys) == 0) return(tibble())

    # For each precinct, extract name and data values
    map(precinct_ys, function(py) {
      # Precinct name: text in the section's ward-name x-range, y in [py, py+12)
      name_words <- pg |>
        filter(x >= ward_name_xmin, x < ward_name_xmax, y >= py, y < py + 12) |>
        arrange(y, x)
      ward_name <- paste(name_words$text, collapse = " ")

      # Skip summary rows
      if (str_detect(ward_name, regex("all ballots|cumulative|countywide|total", ignore_case = TRUE))) {
        return(tibble())
      }
      if (nchar(ward_name) == 0) return(tibble())

      # Extract data for each kept column
      map(seq_len(nrow(col_info)), function(ci) {
        col <- col_info[ci, ]
        # Data at right edge (±1 tolerance), y in [py-2, py+10)
        vals <- pg |>
          filter(
            abs(x + width - col$data_right) <= 1,
            y >= py - 2, y <= py + 10,
            str_detect(text, "^[\\d,]+$")
          )
        if (nrow(vals) == 0) return(tibble())

        votes <- as.integer(str_remove_all(vals$text[1], ","))

        tibble(
          ward = ward_name,
          office = race_name,
          candidate_raw = ifelse(col$col_type == "writein", "write-in:", col$label),
          votes = votes
        )
      }) |> list_rbind()
    }) |> list_rbind()
  }) |> list_rbind()
}


#' Clean and normalize results to standard output format
clean_ozaukee_results <- function(df) {
  if (nrow(df) == 0) {
    return(tibble(
      county = character(), ward = character(), office = character(),
      party = character(), candidate = character(), votes = integer()
    ))
  }

  party_codes <- paste0("(?:", paste(names(ozaukee_party_lookup), collapse = "|"), ")")

  # Extract party from office name (partisan primaries: "Office - REP")
  office_party_match <- paste0(" - (", party_codes, ")(?= |$)")
  office_party_pat <- paste0(" - ", party_codes, "(?= |$)")

  df |>
    mutate(
      # Party from office name (primary)
      office_party_code = str_match(office, office_party_match)[, 2],
      # Party from candidate name (general: "Name (REP)")
      cand_party_code = str_extract(candidate_raw, paste0("\\(", party_codes, "\\)")) |>
        str_remove_all("[()]"),
      # Determine party
      party = case_when(
        !is.na(office_party_code) ~ unname(ozaukee_party_lookup[office_party_code]),
        !is.na(cand_party_code)   ~ unname(ozaukee_party_lookup[cand_party_code]),
        TRUE                      ~ "Nonpartisan"
      ),
      # Strip party prefix from office name
      office = str_remove(office, office_party_pat) |> str_trim(),
      # Strip party code from candidate name
      candidate = str_remove(candidate_raw, paste0("\\s*\\(", party_codes, "\\)\\s*$")) |>
        str_trim(),
      # Write-in party: inherit from race party in primaries
      party = if_else(
        candidate == "write-in:" & !is.na(office_party_code),
        unname(ozaukee_party_lookup[office_party_code]),
        party
      ),
      county = "OZAUKEE",
      votes = as.integer(votes)
    ) |>
    # Aggregate any remaining duplicate rows (defensive)
    group_by(county, ward, office, party, candidate) |>
    summarise(votes = sum(votes), .groups = "drop") |>
    select(county, ward, office, party, candidate, votes)
}
