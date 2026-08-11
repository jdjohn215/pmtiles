#' @title Retrieve ward-level election results from Washington County
#'
#' @description
#' Parses a Washington County SOVC (Statement of Votes Cast) PDF and returns
#' ward-level returns in a standardized long format.
#'
#' Washington County publishes election results as multi-page PDF canvass
#' reports using the same SOVC layout as Racine County: rotated column
#' headers, a left/right page split, and candidate columns spread across
#' consecutive pages.  The county hosts files on SharePoint, which requires
#' authentication and cannot be fetched programmatically; save the PDF
#' locally and pass the file path.
#'
#' The function handles partisan and nonpartisan general elections and
#' partisan and nonpartisan primaries.
#'
#' @param url A URL to a Washington County SOVC PDF, or a local file path.
#' @return A [tibble::tibble] with columns:
#'   `county`, `ward`, `office`, `party`, `candidate`, `votes`.
#'
#' @examples
#' \dontrun{
#' get_washington("path/to/9-11524StatementOfVotesCastRPT.pdf")
#' }
get_washington <- function(url) {
  library(pdftools)
  library(tidyverse)

  if (startsWith(url, "http")) {
    tmp <- tempfile(fileext = ".pdf")
    resp <- httr::GET(
      url,
      httr::user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
      httr::accept("text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8"),
      httr::add_headers(
        `Accept-Language`          = "en-US,en;q=0.9",
        `Accept-Encoding`          = "gzip, deflate, br",
        `Sec-Fetch-Dest`            = "document",
        `Sec-Fetch-Mode`            = "navigate",
        `Sec-Fetch-Site`            = "none",
        `Sec-Fetch-User`            = "?1",
        `Upgrade-Insecure-Requests` = "1"
      ),
      httr::write_disk(tmp, overwrite = TRUE),
      httr::timeout(120)
    )
    if (httr::status_code(resp) != 200) {
      stop("Failed to download PDF (HTTP ", httr::status_code(resp), "). ",
           "Try saving the PDF locally and passing the file path instead.")
    }
    on.exit(unlink(tmp))
    pdf_path <- tmp
  } else {
    pdf_path <- url
  }

  pages <- pdf_data(pdf_path)

  race_info <- find_washington_races(pages)

  map(seq_len(nrow(race_info)), function(i) {
    start <- race_info$page[i]
    end <- if (i < nrow(race_info)) race_info$page[i + 1] - 1 else length(pages)
    parse_washington_race(pages, start, end, race_info$race[i])
  }) |> list_rbind() |>
    clean_washington_results()
}


# Party code lookup (shared with Racine/Brown counties)
washington_party_lookup <- c(
  DEM = "Democratic", REP = "Republican", CON = "Constitution",
  LIB = "Libertarian", WGR = "Wisconsin Green", WIG = "Wisconsin Green",
  IND = "Independent", GRN = "Green", NP = "Nonpartisan"
)


#' Find all race start pages by locating "Vote for" text at height 13
find_washington_races <- function(pages) {
  map(seq_along(pages), function(i) {
    pg <- pages[[i]]
    vf <- pg |> filter(str_detect(text, "Vote"), height == 13)
    if (nrow(vf) == 0) return(NULL)
    vy <- vf$y[1]
    race_text <- pg |> filter(y == vy, height == 13) |> arrange(x)
    tibble(page = i, race = paste(race_text$text, collapse = " "))
  }) |> compact() |> list_rbind()
}


#' Parse all pages of a single race
#'
#' The report repeats the same column layout across multiple page groups
#' (different precincts on each page group).  On later page groups the
#' rotated column headers may omit some text elements (e.g. "Harris" or
#' "/").  To keep candidate names consistent, we pre-scan all pages and
#' keep the longest (most complete) label for each column x-position.
parse_washington_race <- function(pages, start, end, race_name) {
  # Skip "Party Preference" — not a real office
  if (str_detect(race_name, "^Party Preference")) return(tibble())

  # Strip "(Vote for N)" suffix
  race_name <- str_remove(race_name, "\\s*\\(Vote for \\d+\\)\\s*$")

  # First pass: build column-label lookup from all pages in this race
  label_lookup <- build_washington_label_lookup(pages, start:end)

  map(start:end, function(p) {
    parse_washington_page(pages[[p]], race_name, label_lookup)
  }) |> list_rbind()
}


#' Find the y-position of the "Insufficient Turnout" privacy notice, if present
#' on the page.  Elements at this y are horizontal text, not rotated headers.
washington_privacy_y <- function(pg) {
  ins <- pg |> filter(text == "Insufficient")
  if (nrow(ins) == 0) return(NA_integer_) else ins$y[1]
}


#' Build a lookup of the best (longest) column label for each x_min
build_washington_label_lookup <- function(pages, page_nums) {
  map(page_nums, function(p) {
    pg <- pages[[p]]
    prec_filtered <- pg |> filter(text == "Precinct")
    if (nrow(prec_filtered) == 0) return(tibble())
    prec_y <- min(prec_filtered$y)
    priv_y <- washington_privacy_y(pg)
    headers <- pg |> filter(
      width == 7, height >= 3, y > 55, y < prec_y,
      is.na(priv_y) | y != priv_y
    )
    if (nrow(headers) == 0) return(tibble())
    headers <- headers |> arrange(x)
    unique_xs <- sort(unique(headers$x))
    x_groups <- cumsum(c(TRUE, diff(unique_xs) > 15))
    x_map <- tibble(x = unique_xs, col_group = x_groups)
    headers <- headers |> left_join(x_map, by = "x")
    headers |>
      group_by(col_group) |>
      summarise(
        x_min = min(x),
        label = paste(text[order(x, -y)], collapse = " "),
        .groups = "drop"
      ) |>
      select(x_min, label)
  }) |> list_rbind() |>
    group_by(x_min) |>
    slice_max(nchar(label), n = 1, with_ties = FALSE) |>
    ungroup()
}


#' Parse a single page: extract rotated column headers, precinct rows, and data
#'
#' Key differences from Racine:
#' - Numbers contain commas (e.g. "1,760"); regex is ^[\\d,]+$ and commas
#'   are stripped before integer conversion.
#' - Data values are right-aligned, so we match on the right edge (x + width)
#'   rather than the left edge (x), which varies with the number of digits.
#' - Rotated text reads counter-clockwise: labels are reconstructed with
#'   order(x, -y) instead of order(x, y).
#' - Height filter is >= 3 (not >= 10) to capture middle initials and
#'   slashes in candidate names; a y > 55 filter excludes race-name text.
parse_washington_page <- function(pg, race_name, label_lookup = NULL) {
  # Boundary between headers and data: the "Precinct" header y
  prec_filtered <- pg |> filter(text == "Precinct")
  if (nrow(prec_filtered) == 0) return(tibble())
  prec_y <- min(prec_filtered$y)

  # --- Rotated column headers (width=7, height >= 3, above data, below race name) ---
  # Exclude the "Insufficient Turnout" privacy-notice y (horizontal text that
  # can have width=7 and leak into the header filter)
  priv_y <- washington_privacy_y(pg)
  headers <- pg |> filter(
    width == 7, height >= 3, y > 55, y < prec_y,
    is.na(priv_y) | y != priv_y
  )
  if (nrow(headers) == 0) return(tibble())

  # Cluster headers by x position (15px tolerance)
  headers <- headers |> arrange(x)
  unique_xs <- sort(unique(headers$x))
  x_groups <- cumsum(c(TRUE, diff(unique_xs) > 15))
  x_map <- tibble(x = unique_xs, col_group = x_groups)
  headers <- headers |> left_join(x_map, by = "x")

  # Reconstruct column labels: sort by (x, -y) within each cluster
  # (counter-clockwise rotation: x ascending = top-to-bottom, y descending = left-to-right)
  col_info <- headers |>
    group_by(col_group) |>
    summarise(
      x_min = min(x),
      label = paste(text[order(x, -y)], collapse = " "),
      .groups = "drop"
    ) |>
    arrange(x_min)

  # Use pre-computed labels (from the first/best page) when available,
  # so candidate names stay consistent across page groups
  if (!is.null(label_lookup)) {
    col_info <- col_info |>
      left_join(label_lookup, by = "x_min", suffix = c("", "_best")) |>
      mutate(label = if_else(!is.na(label_best), label_best, label)) |>
      select(-label_best)
  }

  # Find data right-edge for each column (most common x+width in [x_min, x_min+40])
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
        # "Unresolved Write-In" is a subset of "Write-in" (all unresolved in
        # Washington County); skip it to avoid double-counting
        str_detect(label, regex("\\bunresolved\\b", ignore_case = TRUE)) ~ "skip",
        str_detect(label, regex("write", ignore_case = TRUE)) ~ "writein",
        TRUE ~ "candidate"
      )
    ) |>
    filter(col_type != "skip")

  if (nrow(col_info) == 0) return(tibble())

  # --- Precinct rows (left side, x < 30, starts with Town/Village/City) ---
  precinct_ys <- pg |>
    filter(x < 30, text %in% c("Town", "Village", "City"), y > prec_y) |>
    pull(y) |>
    sort()

  if (length(precinct_ys) == 0) return(tibble())

  # For each precinct, extract name and data values
  map(precinct_ys, function(py) {
    # Precinct name: text at x < 150, y in [py, py+12), sorted by (y, x)
    name_words <- pg |>
      filter(x < 150, y >= py, y < py + 12) |>
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
      # Data at right edge (±1 tolerance), y in [py-2, py+10]
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
}


#' Clean and normalize results to standard output format
clean_washington_results <- function(df) {
  if (nrow(df) == 0) {
    return(tibble(
      county = character(), ward = character(), office = character(),
      party = character(), candidate = character(), votes = integer()
    ))
  }

  party_codes <- paste0("(?:", paste(names(washington_party_lookup), collapse = "|"), ")")

  # Extract party from office name (partisan primaries: "Office - REP" or
  # "Office - REP - (Dodge)" for cross-county districts).  The party code may
  # be followed by an optional " -" separator and then " (" or end of string.
  office_party_match <- paste0(" - (", party_codes, ")(?: -)?(?= |$)")
  office_party_pat   <- paste0(" - ", party_codes, "(?: -)?(?= |$)")

  df |>
    mutate(
      # Party from office name (primary)
      office_party_code = str_match(office, office_party_match)[, 2],
      # Party from candidate name (general: "Name (REP)")
      cand_party_code = str_extract(candidate_raw, paste0("\\(", party_codes, "\\)")) |>
        str_remove_all("[()]"),
      # Determine party
      party = case_when(
        !is.na(office_party_code) ~ unname(washington_party_lookup[office_party_code]),
        !is.na(cand_party_code)   ~ unname(washington_party_lookup[cand_party_code]),
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
        unname(washington_party_lookup[office_party_code]),
        party
      ),
      county = "WASHINGTON",
      votes = as.integer(votes)
    ) |>
    # Aggregate any remaining duplicate rows (defensive)
    group_by(county, ward, office, party, candidate) |>
    summarise(votes = sum(votes), .groups = "drop") |>
    select(county, ward, office, party, candidate, votes)
}
