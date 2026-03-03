/**
 * Icon mapping from Lucide icon names to SAP icon names.
 * Use `getSapIcon(lucideName)` to resolve a Lucide icon name to its SAP equivalent.
 */

const ICON_MAP: Record<string, string> = {
  // Navigation & arrows
  ChevronDown: "slim-arrow-down",
  ChevronUp: "slim-arrow-up",
  ChevronLeft: "slim-arrow-left",
  ChevronRight: "slim-arrow-right",
  ArrowLeft: "arrow-left",
  ArrowRight: "arrow-right",
  ArrowUp: "arrow-top",
  ArrowDown: "arrow-bottom",

  // Actions
  Plus: "add",
  Trash2: "delete",
  Trash: "delete",
  Pencil: "edit",
  Edit: "edit",
  Search: "search",
  Check: "accept",
  X: "decline",
  Copy: "copy",
  Download: "download",
  Upload: "upload",
  Save: "save",
  RefreshCw: "refresh",
  RotateCcw: "undo",
  ExternalLink: "action",
  Link: "chain-link",
  MoreHorizontal: "overflow",
  MoreVertical: "overflow",
  Filter: "filter",
  SortAsc: "sort-ascending",
  SortDesc: "sort-descending",

  // Status & feedback
  AlertTriangle: "alert",
  AlertCircle: "error",
  Info: "hint",
  HelpCircle: "question-mark",
  CheckCircle: "message-success",
  XCircle: "message-error",
  Bell: "bell",
  BellOff: "bell-2",

  // Objects
  User: "employee",
  Users: "group",
  Settings: "action-settings",
  Calendar: "appointment-2",
  Clock: "history",
  FileText: "document",
  File: "document",
  Folder: "open-folder",
  FolderOpen: "open-folder",
  Mail: "email",
  MessageSquare: "comment",
  Lock: "locked",
  Unlock: "unlocked",
  Eye: "show",
  EyeOff: "hide",
  Star: "favorite",
  Heart: "heart",
  Home: "home",
  Bookmark: "bookmark",

  // Data & charts
  BarChart3: "bar-chart",
  BarChart: "horizontal-bar-chart",
  PieChart: "donut-chart",
  LineChart: "line-chart",
  TrendingUp: "trend-up",
  TrendingDown: "trend-down",
  Activity: "performance",

  // Layout
  Menu: "menu2",
  Grid: "grid",
  List: "list",
  Columns: "table-column",
  Maximize: "full-screen",
  Minimize: "exit-full-screen",
  PanelLeft: "open-pane",
  PanelRight: "close-pane",

  // Media
  Image: "picture",
  Camera: "camera",
  Play: "media-play",
  Pause: "media-pause",

  // Misc
  Sun: "light-mode",
  Moon: "dark-mode",
  Loader2: "synchronize",
  Zap: "energy",
  Shield: "shield",
  Globe: "world",
  Map: "map-2",
  Printer: "print",
  QrCode: "qr-code",
};

/**
 * Get the SAP icon name for a given Lucide icon name.
 * Returns undefined if no mapping exists (keep Lucide icon).
 */
export function getSapIcon(lucideName: string): string | undefined {
  return ICON_MAP[lucideName];
}

/**
 * Format a SAP icon name for use in UI5 component `icon` props.
 * E.g., "add" → "sap-icon://add"
 */
export function sapIconUri(iconName: string): string {
  return `sap-icon://${iconName}`;
}
