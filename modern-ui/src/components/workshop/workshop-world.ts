/** Art only: these keys never change room admission, persistence or network IDs. */
export type WorldArtKey = 'general' | 'vsbl' | 'edge' | 'support' | 'cnct' | 'qa' | 'ui' | 'home'
export type WorldArt = {
  key: WorldArtKey
  label: string
  light: 'dawn' | 'day' | 'dusk'
  roof: string
  wall: string
  accent: string
  landmarks: readonly [string, string, string]
}

export const WORLD_ART: Record<WorldArtKey, WorldArt> = {
  general: { key: 'general', label: 'TOWN SQUARE', light: 'dawn', roof: '#985457', wall: '#46695f', accent: '#e6bb6e', landmarks: ['Clock hall', 'Market stall', 'Town noticeboard'] },
  vsbl: { key: 'vsbl', label: 'TAG DEPOT', light: 'dusk', roof: '#527158', wall: '#4d6256', accent: '#e4bd68', landmarks: ['Inventory lodge', 'Scanner arch', 'Tag crates'] },
  edge: { key: 'edge', label: 'EDGE STATION', light: 'dusk', roof: '#446a79', wall: '#3c5866', accent: '#f2bd68', landmarks: ['Antenna shed', 'Radar mast', 'RFID test bench'] },
  support: { key: 'support', label: 'WELCOME LODGE', light: 'dawn', roof: '#a35b54', wall: '#796351', accent: '#f1cb88', landmarks: ['Welcome lodge', 'Cocoa counter', 'Help sign'] },
  cnct: { key: 'cnct', label: 'RELAY HOUSE', light: 'day', roof: '#5d8993', wall: '#496b72', accent: '#dcaa77', landmarks: ['Relay hut', 'Linked signal poles', 'Cable spool'] },
  qa: { key: 'qa', label: 'SNOW LAB', light: 'day', roof: '#658e91', wall: '#527c7c', accent: '#a8e1ce', landmarks: ['Glass roof lab', 'Test bench', 'Sample rack'] },
  ui: { key: 'ui', label: 'DESIGN STUDIO', light: 'day', roof: '#8b7778', wall: '#607b87', accent: '#f2a596', landmarks: ['Windowed studio', 'Colour swatch board', 'Drawing easel'] },
  home: { key: 'home', label: 'HOME', light: 'dawn', roof: '#8d554b', wall: '#775a46', accent: '#edc38a', landmarks: ['Personal cabin', 'Lantern porch', 'Stacked firewood'] },
}

export function worldArtFor(room: string): WorldArt {
  if (room === 'home' || room.startsWith('home.')) return WORLD_ART.home
  if (Object.prototype.hasOwnProperty.call(WORLD_ART, room) && room !== 'general') return WORLD_ART[room as WorldArtKey]
  return WORLD_ART.general
}
