get_marathon <- function(url) {
  library(pdftools)
  library(tidyverse)

  # Accept URL or local file path
  if (grepl("^https?://", url)) {
    tmp <- tempfile(fileext = ".pdf")
    download.file(url, tmp, mode = "wb", quiet = TRUE)
    on.exit(unlink(tmp))
    pdf_path <- tmp
  } else {
    pdf_path <- url
  }

  pages <- pdf_text(pdf_path)

  party_lookup <- c(
    DEM = "Democratic", REP = "Republican", CON = "Constitution",
    LIB = "Libertarian", WGR = "Wisconsin Green", WIG = "Wisconsin Green",
    WGN = "Wisconsin Green", IND = "Independent", GRN = "Green",
    NP = "Nonpartisan"
  )
  party_codes <- paste0("(", paste(names(party_lookup), collapse = "|"), ")")

  map(pages, function(page_text) {
    lines <- str_split(page_text, "\n")[[1]]

    # Ward name: first line matching Marathon's abbreviated format
    # e.g. "BERGEN T WD 1", "ATHENS V WDS 1 & 2", "WAUSAU C WD 1"
    ward_idx <- which(str_detect(lines, "\\b[TVC]\\s+WD"))
    if (length(ward_idx) == 0) return(tibble())
    ward <- str_trim(lines[ward_idx[1]])

    # Find all "Vote For" lines; race name is the line immediately before
    vf_indices <- which(str_detect(lines, "^Vote For"))
    if (length(vf_indices) == 0) return(tibble())

    map(vf_indices, function(vf_idx) {
      race_name <- str_trim(lines[vf_idx - 1])

      # Skip non-race sections
      if (str_detect(race_name, "Party Preference") || race_name == "Statistics") return(tibble())

      # Determine the end of this race block
      vf_pos <- which(vf_indices == vf_idx)
      if (vf_pos < length(vf_indices)) {
        block_end <- vf_indices[vf_pos + 1] - 2
      } else {
        block_end <- length(lines)
      }

      # Candidate data lines: lines after "Vote For" that end with a digit
      # (optionally followed by %, as in general election lines like "175   33.78%")
      data_lines <- lines[(vf_idx + 1):block_end] |>
        str_trim()

      data_lines <- data_lines[str_detect(data_lines, "\\d+%?$")]

      # Skip summary lines and footer
      skip_re <- "Total Votes Cast|Overvotes|Undervotes|Contest Totals|Precinct Report|Precinct Summary"
      data_lines <- data_lines[!str_detect(data_lines, skip_re)]

      if (length(data_lines) == 0) return(tibble())

      tibble(
        ward = ward,
        office_raw = race_name,
        candidate_line = data_lines
      )
    }) |> list_rbind()
  }) |> list_rbind() |>
    mutate(
      # Remove percentage suffix if present (e.g., "175   33.78%" → "175")
      candidate_line_clean = str_trim(str_remove(candidate_line, "\\s+\\d+\\.\\d+%$")),
      votes = as.integer(str_extract(candidate_line_clean, "\\d+$")),
      candidate_raw = str_trim(str_remove(candidate_line_clean, "\\s+\\d+$")),
      # Write-In Totals → write-in:
      candidate = if_else(
        str_detect(candidate_raw, "Write-In"),
        "write-in:",
        candidate_raw
      ),
      # Party from office name (partisan primaries)
      office_party_code = str_extract(office_raw, paste0("^", party_codes, "(?=\\s)")),
      # Party from candidate name (general elections)
      cand_party_code = str_extract(candidate_raw, paste0("^", party_codes, "(?=\\s)")),
      party = case_when(
        !is.na(office_party_code) ~ unname(party_lookup[office_party_code]),
        !is.na(cand_party_code)   ~ unname(party_lookup[cand_party_code]),
        TRUE                      ~ "Nonpartisan"
      ),
      # Strip party prefix from office name
      office = str_trim(str_remove(office_raw, paste0("^", party_codes, "\\s+"))),
      # Strip party prefix from candidate name (general elections)
      candidate = if_else(
        candidate == "write-in:",
        "write-in:",
        str_trim(str_remove(candidate, paste0("^", party_codes, "\\s+")))
      ),
      # Write-in in primaries inherits race party; in generals/nonpartisan → Nonpartisan
      party = if_else(
        candidate == "write-in:" & is.na(office_party_code),
        "Nonpartisan",
        party
      ),
      county = "MARATHON"
    ) |>
    select(county, ward, office, party, candidate, votes)
}
