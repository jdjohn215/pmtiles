#' @title Retrieve ward-level election results from Rock County
#'
#' @description
#' Parses a Rock County election results HTML page and returns ward-level
#' returns in a standardized long format.
#'
#' Rock County publishes election results as HTML pages. The direct results
#' URLs at `https://elections.co.rock.wi.us/<date>.html` (e.g.
#' `https://elections.co.rock.wi.us/20241105.html`) are accessible
#' programmatically. The county's main website
#' (`https://www.co.rock.wi.us/...`) is behind Akamai bot protection and
#' cannot be fetched directly; save the page locally and pass the file path.
#'
#' The function handles partisan and nonpartisan general elections and
#' partisan and nonpartisan primaries.
#'
#' @param url URL to a Rock County election results HTML page, or a path to
#'   a saved HTML file.
#' @return A [tibble::tibble] with columns:
#'   `county`, `ward`, `office`, `party`, `candidate`, `votes`.
#'
#' @examples
#' \dontrun{
#' get_rock("https://elections.co.rock.wi.us/20241105.html")
#' get_rock("~/Downloads/rock-county-results.html")
#' }
get_rock <- function(url) {
  html <- tryCatch(
    rvest::read_html(url),
    error = function(e) {
      stop(
        "Could not fetch URL or read local file: ", url,
        "\n\nThe Rock County website (www.co.rock.wi.us) is behind bot ",
        "protection and cannot be accessed programmatically. ",
        "Please save the HTML page locally and pass the file path, ",
        "or use the direct elections URL (e.g. elections.co.rock.wi.us/...).",
        call. = FALSE
      )
    }
  )

  tables <- rvest::html_elements(html, "table") |> rvest::html_table()

  if (length(tables) < 4) {
    stop(
      "The page at '", url, "' does not appear to be a valid Rock County ",
      "election results page (no data tables found). ",
      "If you passed a www.co.rock.wi.us URL, the page may be behind bot ",
      "protection. Please save the HTML page locally and pass the file path, ",
      "or use the direct elections URL (e.g. elections.co.rock.wi.us/...).",
      call. = FALSE
    )
  }

  # Tables come in pairs: a summary table (4 cols, office name in row 1 col 1)
  # followed by a precinct table (variable cols, ward names in col 2).
  # The first pair is "Voters and Ballots" (skip). In partisan primaries,
  # a "Party Preference Section" pair also appears (skip).
  results <- list()
  i <- 1

  while (i <= length(tables) - 1) {
    summary_tbl <- tables[[i]]
    precinct_tbl <- tables[[i + 1]]

    # Summary tables: column 1 is character (office name in row 1)
    # Precinct tables: column 1 is logical (all NA), ward names in column 2
    if (nrow(summary_tbl) >= 2 && is.character(summary_tbl[[1]]) &&
        nrow(precinct_tbl) >= 3 && !is.character(precinct_tbl[[1]])) {

      office_raw <- summary_tbl[[1, 1]]

      # Skip non-race tables
      if (office_raw %in% c("Voters and Ballots", "Party Preference Section")) {
        i <- i + 2
        next
      }

      race_df <- parse_rock_race(summary_tbl, precinct_tbl)
      if (!is.null(race_df)) results <- c(results, list(race_df))
      i <- i + 2
    } else {
      i <- i + 1
    }
  }

  dplyr::bind_rows(results)
}


#' Parse a single race (one summary + one precinct table pair)
#'
#' @param summary_tbl A tibble from [rvest::html_table()] for the summary
#'   table. Row 1 contains the office name (col 1) and "Vote For N" (col 2).
#'   Rows 2+ contain candidate names with party in parentheses (col 1),
#'   percentage (col 3), and total votes (col 4).
#' @param precinct_tbl A tibble from [rvest::html_table()] for the precinct
#'   table. Row 1 is the header (office name in col 2, candidate names in
#'   cols 3+). Rows 2+ contain ward names (col 2) and vote counts (cols 3+).
#'   The last row is "Total".
#' @return A tibble with columns `county`, `ward`, `office`, `party`,
#'   `candidate`, `votes`, or `NULL` if parsing fails.
#' @noRd
parse_rock_race <- function(summary_tbl, precinct_tbl) {
  # --- Office name (row 1, col 1) ---
  office_raw <- summary_tbl[[1, 1]]

  # In partisan primaries, the office name is prefixed with a party
  # abbreviation, e.g. "REP Governor". Strip the prefix so the office
  # name is consistent across election types.
  party_prefixes <- c("DEM", "REP", "CON", "LIB", "WGP", "WGR", "WIG",
                      "IND", "GRN", "NP")
  office <- office_raw
  for (pfx in party_prefixes) {
    pattern <- paste0("^", pfx, " ")
    if (grepl(pattern, office)) {
      office <- sub(pattern, "", office)
      break
    }
  }

  # --- Candidate names and parties (rows 2+) ---
  # Format: "Candidate Name  (Party)" — two spaces before the parenthetical.
  candidates <- list()
  for (r in 2:nrow(summary_tbl)) {
    full_text <- summary_tbl[[r, 1]]

    m <- stringr::str_match(full_text, "^(.+?)\\s+\\(([^)]+)\\)\\s*$")
    if (!is.na(m[1, 2])) {
      candidate_name <- m[1, 2]
      party_raw <- m[1, 3]
    } else {
      candidate_name <- full_text
      party_raw <- "Nonpartisan"
    }

    party <- normalize_rock_party(party_raw)

    candidates <- c(candidates, list(list(
      candidate = candidate_name,
      party = party
    )))
  }

  # --- Precinct (ward-level) table ---
  # Row 1: header (skip). Rows 2 to n-1: data. Last row: "Total" (skip).
  n_rows <- nrow(precinct_tbl)
  last_ward <- precinct_tbl[[n_rows, 2]]
  if (!is.na(last_ward) && tolower(last_ward) == "total") {
    data_rows <- 2:(n_rows - 1)
  } else {
    data_rows <- 2:n_rows
  }

  precinct_data <- precinct_tbl[data_rows, , drop = FALSE]
  wards <- precinct_data[[2]]

  # Build long-format output, matching candidates to columns by position
  out <- list()
  for (i in seq_along(candidates)) {
    cand <- candidates[[i]]
    col_idx <- i + 2  # candidate columns start at column 3

    if (col_idx > ncol(precinct_data)) next

    votes <- precinct_data[[col_idx]]
    votes <- suppressWarnings(as.integer(stringr::str_remove_all(votes, ",")))
    votes[is.na(votes)] <- 0L

    out[[length(out) + 1]] <- tibble::tibble(
      county = "ROCK",
      ward = wards,
      office = office,
      party = cand$party,
      candidate = cand$candidate,
      votes = votes
    )
  }

  dplyr::bind_rows(out)
}


#' Normalize party names from Rock County HTML
#'
#' The HTML uses "NONPARTISAN" (uppercase) for nonpartisan labels; normalize
#' to "Nonpartisan". All other party names (e.g. "Democratic", "Republican",
#' "Wisconsin Green") are used as-is.
#'
#' @param party_raw Raw party string from the HTML parenthetical.
#' @return Normalized party name.
#' @noRd
normalize_rock_party <- function(party_raw) {
  party <- trimws(party_raw)
  if (toupper(party) == "NONPARTISAN") {
    return("Nonpartisan")
  }
  party
}
