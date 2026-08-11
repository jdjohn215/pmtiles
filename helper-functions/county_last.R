#' Find the most recent file for a given county in a directory
#'
#' Files are expected to follow the naming convention:
#'   "<County Name> <YYYY-MM-DD> <HH-MM-SS>[.<microseconds>].<extension>"
#'
#' @param directory Path to a directory containing county files.
#' @param county County name (case-insensitive), e.g. "Brown" or "green lake".
#' @return Full path to the most recent matching file.
#' @examples
#' county_last("raw/nov2024", "Brown")
county_last <- function(directory, county) {
  files <- list.files(directory, full.names = TRUE)
  basenames <- basename(files)

  county_escaped <- gsub("([.^$|?*+()\\[\\]{}\\\\])", "\\\\\\1", county, perl = TRUE)
  pattern <- paste0("^", county_escaped, " (\\d{4}-\\d{2}-\\d{2} \\d{2}-\\d{2}-\\d{2})")

  idx <- which(grepl(pattern, basenames, perl = TRUE, ignore.case = TRUE))
  if (length(idx) == 0) {
    stop("No files found for county '", county, "' in '", directory, "'")
  }

  m <- regexec(pattern, basenames[idx], perl = TRUE, ignore.case = TRUE)
  timestamps <- vapply(regmatches(basenames[idx], m), `[`, character(1), 2)

  files[idx[order(timestamps, decreasing = TRUE)][1]]
}
