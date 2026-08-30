// Insert thousand separators into 5+ digit numbers in user-facing anchor titles, so
// "100000 BC" reads as "100,000 BC" while a year like 1453 stays unchanged (years never
// take separators). Display-only: stored titles keep raw digits so date parsing and
// anchor matching never see formatted numbers.
export function formatTitleNumbers(s) {
    if (typeof s !== 'string') return s;
    return s.replace(/\d{5,}/g, n => Number(n).toLocaleString('en-GB'));
}
