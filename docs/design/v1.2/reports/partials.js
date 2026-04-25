// Shared partials for Aptus report mocks
// Each mock is a self-contained HTML file, but uses these helpers via inline <script>

window.AptusReport = {
  // Standard cover content
  meta: {
    industry: "Banking & Capital Markets",
    country: "Malaysia",
    size: "Large enterprise (>10,000)",
    date: "April 25, 2026",
    preparedBy: "ABeam Consulting",
    client: "Bursa Malaysia Berhad"
  },

  cover({ title, subtitle, lead, brand = "default", pageNum = 1, fileName }) {
    return `
      <div class="page" data-brand="${brand}">
        <div class="cover-band">
          <div class="cover-mark">Aptus</div>
          <div>
            <h1 class="cover-title">${title}</h1>
            <p class="cover-subtitle">${subtitle}</p>
          </div>
        </div>
        <div class="cover-meta">
          ${this.metaRow("Industry", this.meta.industry)}
          ${this.metaRow("Country", this.meta.country)}
          ${this.metaRow("Company size", this.meta.size)}
          ${this.metaRow("Report date", this.meta.date)}
          ${this.metaRow("Prepared by", this.meta.preparedBy)}
        </div>
        <div class="cover-lead">${lead}</div>
        <div class="page-footer">Aptus · Confidential · ${pageNum}${fileName ? ` · ${fileName}` : ""}</div>
      </div>
    `;
  },

  metaRow(label, value) {
    return `<div class="cover-meta-row">
      <div class="cover-meta-label">${label}</div>
      <div class="cover-meta-value">${value}</div>
    </div>`;
  },

  pageFooter(pageNum, fileName) {
    return `<div class="page-footer">Aptus · Confidential · ${pageNum}${fileName ? ` · ${fileName}` : ""}</div>`;
  },

  reviewBar(file, prev, next) {
    const prevLink = prev ? `<a href="${prev}">← prev</a>` : "<span></span>";
    const nextLink = next ? `<a href="${next}">next →</a>` : "<span></span>";
    return `<div class="review-bar">
      ${prevLink}
      <span><a href="index.html">All reports</a> · ${file}</span>
      ${nextLink}
    </div>`;
  }
};
