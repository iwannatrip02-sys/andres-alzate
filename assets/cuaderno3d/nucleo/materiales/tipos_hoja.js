// tipos_hoja.js · hojas realistas: cada tipo junta el papel físico (gramaje, calibre, rigidez → cómo se dobla y cae), el color,
// la textura (grano, fibras, relieve), el rayado impreso y cuánto deja pasar la luz. Todo se puede cambiar después por separado.
import { PRESETS_PAPEL } from './papel_textura.js';

const sinNombre = (p) => { const q = { ...p }; delete q.nombre; return q; };
const T = (base, extra = {}) => ({ ...sinNombre(PRESETS_PAPEL[base]), ...extra });

export const TIPOS_HOJA = {
  bocetos:   { nombre: 'Bocetos · dibujo 150 g', papel: 'dibujo150', color: '#f4efe4', grano: 'dibujo', textura: T('nuevo'), rayado: 'nada' },
  acuarela:  { nombre: 'Acuarela 300 g · grano fino', papel: 'acuarela300', color: '#f7f4ec', grano: 'acuarela', textura: T('nuevo', { roughness: 0.85, roughnessSize: 0.75, fiber: 0.55, tono: 0.55, relieve: 1.3 }), rayado: 'nada' },
  mixta:     { nombre: 'Mixed media 200 g', papel: 'cartulina250', color: '#f6f2e8', grano: 'dibujo', textura: T('nuevo', { roughness: 0.5, fiber: 0.35, tono: 0.4 }), rayado: 'nada' },
  kraft:     { nombre: 'Kraft 120 g', papel: 'kraft120', color: '#c39f74', grano: 'dibujo', textura: T('nuevo', { roughness: 0.5, fiber: 0.85, fiberSize: 0.35, drops: 0.15, colorShadow: '#a8916f', tono: 0.6 }), rayado: 'nada' },
  negra:     { nombre: 'Negra 150 g', papel: 'dibujo150', color: '#2b2927', grano: 'dibujo', textura: T('nuevo', { colorShadow: '#6f6a64', tono: 0.35 }), rayado: 'nada' },
  calco:     { nombre: 'Calco / mantequilla 60 g', papel: 'calco60', color: '#f2f1ec', grano: 'liso', textura: T('liso', { roughness: 0.08, fiber: 0.2, tono: 0.15 }), rayado: 'nada', trasluz: 0.45, transmision: 0.55 },
  rayada:    { nombre: 'Rayada · bond 90 g', papel: 'bond90', color: '#fbfaf6', grano: 'liso', textura: T('liso'), rayado: 'lineas' },
  cuadros:   { nombre: 'Cuadriculada 5 mm · bond 90 g', papel: 'bond90', color: '#fbfaf6', grano: 'liso', textura: T('liso'), rayado: 'cuadricula' },
  puntos:    { nombre: 'Punteada 5 mm · 120 g', papel: 'kraft120', color: '#f7f5ef', grano: 'liso', textura: T('liso', { roughness: 0.2 }), rayado: 'puntos' },
  verjurada: { nombre: 'Verjurada (laid)', papel: 'dibujo150', color: '#f1ead9', grano: 'dibujo', textura: T('verjurado', { tono: 0.45 }), rayado: 'nada' },
  usada:     { nombre: 'Usada · arrugas y motas', papel: 'dibujo150', color: '#efe7d4', grano: 'dibujo', textura: T('usado'), rayado: 'nada' },
};

// rayados impresos (en tinta clara, debajo del dibujo)
export const RAYADOS = {
  nada: { nombre: 'En blanco', modo: 0 },
  lineas: { nombre: 'Rayas 7 mm', modo: 1, paso: 0.007, color: '#86a6cc' },
  cuadricula: { nombre: 'Cuadrícula 5 mm', modo: 2, paso: 0.005, color: '#93b0cc' },
  puntos: { nombre: 'Puntos 5 mm', modo: 3, paso: 0.005, color: '#86817a' },
};
