// TypeScript interfaces and types
// import { RDKitModule } from '@rdkit/rdkit';
// import { NODE_STYLES } from "./constants";
// import { Dispatch, SetStateAction } from 'react';

export interface ToolServer {
  id: string;
  url: string;
  name?: string;  // Optional display name
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
  httpServerUrl: string;  // Required: base URL for backend API calls
}