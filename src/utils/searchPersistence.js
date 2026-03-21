export let lastSearchQuery = '';
export let lastSearchResults = [];
export let lastSearchError = '';

export function setLastSearchQuery(query) {
  lastSearchQuery = query;
}

export function setLastSearchResults(results) {
  lastSearchResults = results;
}

export function setLastSearchError(error) {
  lastSearchError = error;
}
