const STOPWORDS = new Set([
  'il','lo','la','i','gli','le','un','uno','una','di','a','da','in','con','su','per','tra','fra',
  'e','o','ma','se','che','chi','cui','non','più','anche','come','quando','dove','perché','del',
  'della','dello','dei','degli','delle','al','allo','alla','ai','agli','alle','dal','dallo','dalla',
  'dai','dagli','dalle','nel','nello','nella','nei','negli','nelle','sul','sullo','sulla','sui',
  'sugli','sulle','questo','questa','questi','queste','quello','quella','quelli','quelle','suo',
  'sua','suoi','sue','loro','nostro','nostra','vostro','vostra','essere','sono','è','siamo','siete',
  'stato','stata','stati','state','avere','ha','hanno','abbiamo','avete','deve','devono','può',
  'possono','viene','vengono','fare','fa','fanno','tutto','tutti','tutta','tutte','ogni','alcuni',
  'alcune','molto','molti','poco','pochi','solo','sia','pag','pagina'
]);

function extractKeywords(text, maxKeywords = 8) {
  if (!text) return [];

  const words = text
    .toLowerCase()
    .match(/[a-zàèéìòù]{4,}/g) || [];

  const freq = {};
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

module.exports = { extractKeywords };