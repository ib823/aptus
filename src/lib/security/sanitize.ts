/** HTML sanitization for user-facing content rendered with dangerouslySetInnerHTML */

import sanitizeHtml from "sanitize-html";

const SAFE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td",
    "strong", "b", "em", "i", "u", "s", "sub", "sup",
    "a", "span", "div",
    "blockquote", "pre", "code",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    span: ["class"],
    div: ["class"],
    p: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  // Force all links to open safely
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer",
    }),
  },
  // Strip all event handlers (onclick, onerror, onload, etc.)
  disallowedTagsMode: "discard",
};

/**
 * Sanitize HTML content for safe rendering with dangerouslySetInnerHTML.
 * Removes all script tags, event handlers, and dangerous attributes.
 */
export function sanitizeHtmlContent(html: string): string {
  return sanitizeHtml(html, SAFE_HTML_OPTIONS);
}

/**
 * Sanitize SVG content — strips all script-related elements and attributes.
 */
const SAFE_SVG_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "svg", "g", "path", "rect", "circle", "ellipse", "line",
    "polyline", "polygon", "text", "tspan", "defs", "use",
    "marker", "clipPath", "mask", "pattern", "linearGradient",
    "radialGradient", "stop", "title", "desc",
  ],
  allowedAttributes: {
    "*": [
      "id", "class", "style", "fill", "stroke", "stroke-width",
      "transform", "d", "x", "y", "cx", "cy", "r", "rx", "ry",
      "width", "height", "viewBox", "xmlns", "xmlns:xlink",
      "points", "x1", "y1", "x2", "y2", "dx", "dy",
      "text-anchor", "dominant-baseline", "font-family",
      "font-size", "font-weight", "letter-spacing",
      "opacity", "stroke-dasharray", "stroke-linecap",
      "stroke-linejoin", "marker-end", "marker-start",
      "clip-path", "mask", "offset", "stop-color", "stop-opacity",
      "gradientUnits", "gradientTransform", "spreadMethod",
      "preserveAspectRatio", "overflow",
    ],
  },
  allowedSchemes: [],
  disallowedTagsMode: "discard",
};

export function sanitizeSvgContent(svg: string): string {
  return sanitizeHtml(svg, SAFE_SVG_OPTIONS);
}
