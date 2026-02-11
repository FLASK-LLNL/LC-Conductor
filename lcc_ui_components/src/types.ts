import { Dispatch, SetStateAction } from 'react';

// ============================================================================
// Settings Types
// ============================================================================

export interface ToolServer {
  id: string;
  url: string;
  name?: string;
}

export type MoleculeNameFormat = 'brand' | 'iupac' | 'formula' | 'smiles';

export interface OrchestratorSettings {
  backend: string;
  useCustomUrl: boolean;
  customUrl?: string;
  model: string;
  useCustomModel?: boolean;
  apiKey: string;
  backendLabel: string;
  moleculeName?: MoleculeNameFormat;
  toolServers?: ToolServer[];
}

export interface BackendOption {
  value: string;
  label: string;
  defaultUrl: string;
  models: string[];
}

export interface MoleculeNameOption {
  value: string;
  label: string;
}

export interface SettingsButtonProps {
  onClick?: () => void;
  onSettingsChange?: (settings: OrchestratorSettings) => void;
  onServerAdded?: () => void;
  onServerRemoved?: () => void;
  initialSettings?: Partial<OrchestratorSettings>;
  username?: string;
  className?: string;
  httpServerUrl: string;
}

// ============================================================================
// Sidebar Types
// ============================================================================

export interface SidebarMessage {
  id: number;
  timestamp: string;
  message: string;
  smiles: string | null;
  source: string;
}

export interface VisibleSources {
  [key: string]: boolean;
}

export interface SidebarState {
  messages: SidebarMessage[];
  setMessages: Dispatch<SetStateAction<SidebarMessage[]>>;
  sourceFilterOpen: boolean;
  setSourceFilterOpen: Dispatch<SetStateAction<boolean>>;
  visibleSources: VisibleSources;
  setVisibleSources: Dispatch<SetStateAction<VisibleSources>>;
}

export interface SidebarProps extends SidebarState {
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  rdkitModule?: any;  // Optional RDKit module (for backwards compatibility)
}

// ============================================================================
// Markdown Types
// ============================================================================

export interface MarkdownTextProps {
  text: string;
  className?: string;
}