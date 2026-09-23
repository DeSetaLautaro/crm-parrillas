function normalizarTelefono(telefono) {
  let t = String(telefono || '').replace(/\D/g, '');
  if (!t) return '';
  if (t.startsWith('549') && t.length === 13) return t;
  if (t.startsWith('54')) {
    if (!t.startsWith('549')) {
      t = '549' + t.slice(2);
    }
    return t;
  }
  if (t.startsWith('9') && t.length === 11) {
    t = '549' + t.slice(1);
    return t;
  }
  if (t.startsWith('15') && t.length === 11) {
    t = '549' + t.slice(2);
    return t;
  }
  t = t.replace(/^0/, '');
  return '549' + t;
}

module.exports = { normalizarTelefono };
