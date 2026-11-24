// Shared, data-only catalogue selectors. No DOM, network, or permission logic.
export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CO').trim();
}

export function filterServices(catalogue, {query = '', category = ''} = {}) {
  const items = Array.isArray(catalogue?.items) ? catalogue.items : [];
  const categories = Array.isArray(catalogue?.categories) ? catalogue.categories : [];
  const names = new Map(categories.map(item => [item.id, item.title]));
  const needle = normalizeSearch(query);
  return items.filter(item => {
    if (category && item.category !== category) return false;
    const words = [item.title, item.description, names.get(item.category), item.channel].join(' ');
    return !needle || normalizeSearch(words).includes(needle);
  }).sort((a,b) => Number(Boolean(b.standard)) - Number(Boolean(a.standard)) ||
    String(a.title).localeCompare(String(b.title), 'es-CO'));
}

export function categoryCounts(catalogue) {
  const items = Array.isArray(catalogue?.items) ? catalogue.items : [];
  const categories = Array.isArray(catalogue?.categories) ? catalogue.categories : [];
  return [{id:'', title:'Todos los trámites', count:items.length}, ...categories.map(item => ({
    id:item.id, title:item.title, count:items.filter(service => service.category === item.id).length
  }))];
}
