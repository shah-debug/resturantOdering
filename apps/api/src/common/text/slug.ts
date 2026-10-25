export function slugify(value: string, fallback: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}

export function nextAvailableSlug(base: string, taken: ReadonlySet<string>): string {
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix += 1) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}
