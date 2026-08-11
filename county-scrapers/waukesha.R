#' @title Retrieve ward-level election results from Waukesha County
#'
#' @description
#' Parses a Waukesha County election results page and returns ward-level
#' results in a standardized long format.
#'
#' Waukesha County publishes election results as HTML pages at
#' `https://electionresults.waukeshacounty.gov/contests.aspx?contest=-1`.
#' The `contest=-1` parameter shows all contests; specific contests can be
#' viewed with `contest=<id>`.
#'
#' The function handles partisan and nonpartisan general elections and
#' partisan and nonpartisan primaries.
#'
#' @param url A URL to a Waukesha County election results page, or a path
#'   to a saved HTML file.
#' @return A [tibble::tibble] with columns:
#'   `county`, `ward`, `office`, `party`, `candidate`, `votes`.
#'
#' @examples
#' \dontrun{
#' get_waukesha("https://electionresults.waukeshacounty.gov/contests.aspx?contest=-1")
#' }
get_waukesha <- function(url) {
  # Read HTML from URL or local file
  if (grepl("^https?://", url)) {
    html <- rvest::read_html(url)
  } else {
    html <- xml2::read_html(url)
  }

  # Party code → full party name
  party_map <- c(
    "DEM" = "Democratic", "REP" = "Republican",
    "CON" = "Constitution", "LIB" = "Libertarian",
    "WGN" = "Wisconsin Green", "WGR" = "Wisconsin Green",
    "WIG" = "Wisconsin Green", "IND" = "Independent",
    "GRN" = "Green", "NP" = "Nonpartisan"
  )

  # Each contest on the page has:
  #   div.summaryCaption  – office name
  #   table.tblRU        – reporting-unit detail (inside a div[id^="detail"])
  captions  <- rvest::html_elements(html, ".summaryCaption")
  ru_tables <- rvest::html_elements(html, "table.tblRU")

  if (length(captions) == 0 || length(ru_tables) == 0) {
    return(tibble::tibble(
      county = character(), ward = character(),
      office = character(), party = character(),
      candidate = character(), votes = integer()
    ))
  }

  results <- list()
  for (i in seq_along(captions)) {
    if (i > length(ru_tables)) break

    office_raw <- rvest::html_text(captions[[i]], trim = TRUE)

    # Skip Party Preference Section — not a real office
    if (office_raw == "Party Preference Section") next

    # Strip party prefix from office name (partisan primaries, e.g. "REP Governor")
    office     <- office_raw
    race_party <- "Nonpartisan"
    for (code in names(party_map)) {
      pattern <- paste0("^", code, " ")
      if (grepl(pattern, office)) {
        office     <- sub(pattern, "", office)
        race_party <- party_map[code]
        break
      }
    }

    # --- Parse the reporting-unit table ---
    ru_tbl <- ru_tables[[i]]

    # Candidate names from the header row
    cand_names <- ru_tbl |>
      rvest::html_elements("th.thVoteHead") |>
      rvest::html_text(trim = TRUE)

    if (length(cand_names) == 0) next

    # Data rows (tr.trRU); skip the totals row at the bottom
    data_rows <- ru_tbl |> rvest::html_elements("tr.trRU")

    if (length(data_rows) > 0) {
      last_ward <- data_rows[[length(data_rows)]] |>
        rvest::html_element("td.tdRUName") |>
        rvest::html_text(trim = TRUE)
      if (!is.na(last_ward) && grepl("^Totals", last_ward)) {
        data_rows <- data_rows[-length(data_rows)]
      }
    }

    if (length(data_rows) == 0) next

    # Ward (reporting unit) names
    wards <- vapply(data_rows, function(row) {
      row |>
        rvest::html_element("td.tdRUName") |>
        rvest::html_text(trim = TRUE)
    }, character(1))

    # Build one long-format slice per candidate column
    for (j in seq_along(cand_names)) {
      cand <- cand_names[j]

      # Normalize write-in label
      if (tolower(cand) %in% c("write-in", "write-in:")) {
        cand <- "write-in:"
      }

      # Check for party prefix in candidate name (general elections)
      cand_party <- NULL
      for (code in names(party_map)) {
        pattern <- paste0("^", code, " ")
        if (grepl(pattern, cand)) {
          cand       <- sub(pattern, "", cand)
          cand_party <- party_map[code]
          break
        }
      }

      # Determine party for this candidate
      if (cand == "write-in:") {
        # Write-in inherits race party in primaries; Nonpartisan otherwise
        party <- if (race_party != "Nonpartisan") race_party else "Nonpartisan"
      } else {
        party <- if (!is.null(cand_party)) cand_party else race_party
      }

      # Extract votes for this candidate across all wards
      votes <- vapply(data_rows, function(row) {
        cells <- row |> rvest::html_elements("td.tdRUVote")
        if (j <= length(cells)) {
          rvest::html_text(cells[[j]], trim = TRUE)
        } else {
          "0"
        }
      }, character(1))
      votes <- as.integer(gsub(",", "", votes))
      votes[is.na(votes)] <- 0L

      results[[length(results) + 1]] <- tibble::tibble(
        county    = "WAUKESHA",
        ward      = wards,
        office    = office,
        party     = party,
        candidate = cand,
        votes     = votes
      )
    }
  }

  dplyr::bind_rows(results)
}
