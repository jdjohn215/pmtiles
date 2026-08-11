#' @title Retrieve ward-level election results from Milwaukee County
#'
#' @description
#' Parses a Milwaukee County election results page and returns ward-level
#' returns in a standardized long format.
#'
#' Milwaukee County publishes election results as HTML pages at URLs like
#' `https://county.milwaukee.gov/EN/County-Clerk/Off-Nav/Election-Results/...`.
#' The pages are behind a Cloudflare bot challenge, so the HTML must be
#' saved locally (e.g. via a browser "Save Page As") and passed to this
#' function as a file path.
#'
#' The function handles partisan and nonpartisan general elections and
#' partisan and nonpartisan primaries.
#'
#' @param file Path to a saved HTML file of a Milwaukee County election
#'   results page.
#' @return A [tibble::tibble] with columns:
#'   `county`, `ward`, `office`, `party`, `candidate`, `votes`.
#'
#' @examples
#' \dontrun{
#' get_milwaukee("~/Downloads/Milwaukee-County-Election-Results/11-5-24Fall-General-Election.html")
#' }
get_milwaukee <- function(file) {
  html <- xml2::read_html(file)
  tables <- rvest::html_elements(html, "table")

  # Tables come in pairs: a summary table (no class) followed by a
  # precinct table (class = "precinctTable").  The very first pair is the
  # voter/ballots overview, which we skip.
  results <- list()
  idx <- 3  # start at the first race pair (tables 3 & 4)

  while (idx < length(tables)) {
    summary_tbl <- tables[[idx]]
    precinct_tbl <- tables[[idx + 1]]

    # Guard: make sure we have a summary + precinct pair
    if (!is.na(rvest::html_attr(precinct_tbl, "class")) &&
        rvest::html_attr(precinct_tbl, "class") == "precinctTable") {
      race_df <- parse_race(summary_tbl, precinct_tbl)
      if (!is.null(race_df)) results <- c(results, list(race_df))
    }
    idx <- idx + 2
  }

  dplyr::bind_rows(results)
}


#' Parse a single race (one summary + one precinct table pair)
#' @noRd
parse_race <- function(summary_tbl, precinct_tbl) {
  summary_rows <- rvest::html_elements(summary_tbl, "tr")
  if (length(summary_rows) < 2) return(NULL)

  # --- Office name (row 1, cell 1) ---
  office_cell <- rvest::html_elements(summary_rows[[1]], "td") |> magrittr::extract2(1)
  office_raw <- trimws(rvest::html_text(office_cell, trim = TRUE))

  # In partisan primaries the office name is prefixed with a party
  # abbreviation, e.g. "DEM United States Senator".  Strip the prefix so
  # the office name is the same regardless of election type.
  party_prefixes <- c(
    "DEM", "REP", "CON", "LIB", "WGN", "IND", "GRN",
    "SCP", "PF", "WCP", "AMP", "APN", "IP", "RIP", "UAP"
  )
  office <- office_raw
  for (pfx in party_prefixes) {
    pattern <- paste0("^", pfx, " ")
    if (grepl(pattern, office)) {
      office <- sub(pattern, "", office)
      break
    }
  }

  # Skip the "Party Preference Section" pseudo-contest — it is not a real
  # office and its "candidates" are party names, not people.
  if (office == "Party Preference Section") return(NULL)

  # --- Candidate names and parties (rows 2+) ---
  candidates <- list()
  for (r in 2:length(summary_rows)) {
    cell <- rvest::html_elements(summary_rows[[r]], "td") |> magrittr::extract2(1)
    full_text <- trimws(rvest::html_text(cell, trim = TRUE))

    # The cell text is: "CandidateName\n          (PartyName)"
    # Split on newline to separate the candidate name from the party label.
    parts <- strsplit(full_text, "\n") |> magrittr::extract2(1)
    candidate_name <- trimws(parts[1])

    # Party comes from the <span> element, which contains "(PartyName)".
    span <- rvest::html_elements(cell, "span")
    if (length(span) > 0) {
      party_raw <- trimws(rvest::html_text(span[[1]], trim = TRUE))
      party <- gsub("[()]", "", party_raw)  # strip parentheses
    } else {
      # Fallback: try to parse party from the full text
      party <- if (length(parts) > 1) gsub("[()]", "", trimws(parts[2])) else "Unknown"
    }

    candidates <- c(candidates, list(list(
      candidate = candidate_name,
      party = party
    )))
  }

  # --- Precinct (ward-level) table ---
  precinct_df <- rvest::html_table(precinct_tbl)

  # Detect whether the table has a numeric ward-ID column.
  # Fall general / partisan primary: col 1 = ward ID (int), col 2 = ward name
  # Spring nonpartisan general: col 1 = ward name (no numeric ID)
  has_ward_id <- !is.na(suppressWarnings(as.integer(precinct_df[2, 1])))

  if (has_ward_id) {
    # Columns: ward_id, ward_name, candidate1, candidate2, ...
    names(precinct_df)[1:2] <- c("ward_id", "ward")
    candidate_cols <- 3:ncol(precinct_df)
  } else {
    # Columns: ward_name, candidate1, candidate2, ...
    names(precinct_df)[1] <- "ward"
    candidate_cols <- 2:ncol(precinct_df)
  }

  # Remove the header row (row 1) and the totals row (last row).
  # The header row is the one where ward is "Ward" or ward_id is NA.
  # The totals row has "Total" in the ward column.
  n_rows <- nrow(precinct_df)
  if (has_ward_id) {
    # Row 1 is the header (ward_id = NA, ward = "Ward")
    data_rows <- 2:(n_rows - 1)
  } else {
    # Row 1 is the header (ward = "Ward" or a candidate name)
    # Detect: header row has "Ward" in the first column
    if (precinct_df[1, 1] == "Ward") {
      data_rows <- 2:(n_rows - 1)
    } else {
      data_rows <- 1:(n_rows - 1)
    }
  }

  # Remove the totals row (last row, which has "Total" somewhere)
  # Already handled by going to n_rows - 1

  precinct_data <- precinct_df[data_rows, , drop = FALSE]

  # Map precinct columns to candidates.  The precinct header row contains
  # candidate names that match the text-before-span from the summary table.
  # We match by position: the i-th candidate column corresponds to the
  # i-th candidate in the summary table.
  header_row <- precinct_df[1, , drop = FALSE]

  # Build the long-format result
  out <- list()
  for (i in seq_along(candidates)) {
    cand <- candidates[[i]]
    col_idx <- candidate_cols[i]
    if (col_idx > ncol(precinct_data)) next

    votes <- precinct_data[[col_idx]]
    votes <- suppressWarnings(as.integer(votes))
    votes[is.na(votes)] <- 0L

    out[[length(out) + 1]] <- tibble::tibble(
      county = "MILWAUKEE",
      ward = precinct_data[["ward"]],
      office = office,
      party = cand$party,
      candidate = cand$candidate,
      votes = votes
    )
  }

  dplyr::bind_rows(out)
}
