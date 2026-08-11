#' @title Retrieve ward-level election results from Dane County
#'
#' @description
#' Fetches ward-level election results from the Dane County elections API
#' (\url{https://api.danecounty.gov}) and returns them in a standardized
#' long format.
#'
#' Dane County provides a REST API for election results.  This function
#' accepts an election date, looks up the corresponding election ID, and
#' retrieves precinct-level results for every race on that date.
#'
#' The function handles partisan and nonpartisan general elections and
#' partisan and nonpartisan primaries.
#'
#' @param election_date An election date as a \code{Date} object or a string
#'   in YYYY-MM-DD format (e.g. \code{"2024-11-05"}).
#' @return A [tibble::tibble] with columns:
#'   \code{county}, \code{ward}, \code{office}, \code{party}, \code{candidate},
#'   \code{votes}.
#'
#' @examples
#' \dontrun{
#' get_dane("2024-11-05")  # 2024 Fall General
#' get_dane("2024-08-13")  # 2024 Fall Primary
#' get_dane("2026-04-07")  # 2026 Spring General
#' get_dane("2026-02-17")  # 2026 Spring Primary
#' }
get_dane <- function(election_date) {
  election_date <- as.Date(election_date)

  # Look up the election ID from the API's election list
  elections <- dane_api("elections", "list")
  match_idx <- which(as.Date(elections$ElectionDate) == election_date)

  if (length(match_idx) == 0) {
    available <- paste(elections$ElectionName,
                       format(as.Date(elections$ElectionDate), "%Y-%m-%d"),
                       collapse = "\n")
    stop("No Dane County election found for ", election_date, ".\n",
         "Available elections:\n", available)
  }

  election_id <- elections$ElectionId[match_idx[1]]

  # Fetch the race list and skip non-race entries (e.g. "BALLOTS CAST - TOTAL")
  races <- dane_api("elections", "races", as.character(election_id))
  races <- races[!grepl("^BALLOTS CAST|^REGISTERED VOTERS", races$RaceName), ]

  # Fetch precinct results for each race
  results <- lapply(seq_len(nrow(races)), function(i) {
    dane_parse_race(election_id, races$RaceNumber[i], races$RaceName[i])
  })

  dplyr::bind_rows(results)
}


#' Fetch JSON from the Dane County elections API
#' @noRd
dane_api <- function(...) {
  req <- httr2::request("https://api.danecounty.gov/api/v1") |>
    httr2::req_url_path_append(...) |>
    httr2::req_headers(Accept = "application/json")
  resp <- httr2::req_perform(req)
  jsonlite::fromJSON(httr2::resp_body_string(resp), simplifyVector = TRUE)
}


#' Parse precinct-level results for a single race
#' @noRd
dane_parse_race <- function(election_id, race_number, race_name) {
  data <- dane_api("elections", "precinctresults",
                   as.character(election_id), race_number)

  pv <- data$PrecinctVotes
  if (is.null(pv) || !is.data.frame(pv) || nrow(pv) == 0) return(NULL)

  candidates <- data$ElectionRace$Candidates
  if (is.null(candidates) || !is.data.frame(candidates) || nrow(candidates) == 0) return(NULL)

  # Join precinct votes with candidate metadata to get PartyName
  party_lookup <- candidates[, c("Number", "PartyName")]
  pv <- dplyr::left_join(pv, party_lookup, by = c("CandidateNumber" = "Number"))

  # Strip party prefix from office name (e.g. "DEM United States Senator")
  office <- dane_strip_prefix(race_name)

  # Clean candidate names: strip party prefix, trim whitespace, normalize write-in
  candidate <- dane_strip_prefix(pv$CandidateName)
  candidate <- trimws(candidate)
  candidate <- ifelse(grepl("^write-?in:?$", candidate, ignore.case = TRUE),
                      "write-in:", candidate)

  # Normalize party names: fix "Non-Partisan" casing, fall back to PartyCD
  # lookup when the API leaves PartyName blank (e.g. Green party in 2024)
  party <- pv$PartyName
  party[party == "Non-Partisan"] <- "Nonpartisan"

  party_fallback <- c(
    DEM = "Democratic", REP = "Republican", CON = "Constitution",
    LIB = "Libertarian", GRN = "Green", IND = "Independent",
    NON = "Nonpartisan", Non = "Nonpartisan"
  )
  missing <- is.na(party) | party == ""
  party[missing] <- unname(party_fallback[pv$PartyCD[missing]])

  tibble::tibble(
    county = "DANE",
    ward = trimws(pv$PrecinctName),
    office = office,
    party = party,
    candidate = candidate,
    votes = as.integer(pv$TotalVotes)
  )
}


#' Strip a known party prefix (e.g. "DEM", "REP") from a string
#' @noRd
dane_strip_prefix <- function(x) {
  party_prefixes <- c("DEM", "REP", "CON", "LIB", "GRN", "WGN", "IND",
                      "SCP", "PF", "WCP", "AMP", "APN", "IP", "RIP", "UAP")
  for (pfx in party_prefixes) {
    x <- sub(paste0("^", pfx, " "), "", x, ignore.case = TRUE)
  }
  x
}
