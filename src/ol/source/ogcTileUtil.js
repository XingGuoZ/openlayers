/**
 * @module ol/source/ogcTileUtil
 */

import TileGrid from '../tilegrid/TileGrid.js';
import {assign} from '../obj.js';
import {getJSON, resolveUrl} from '../net.js';
import {get as getProjection} from '../proj.js';

/**
 * See https://ogcapi.ogc.org/tiles/.
 */

/**
 * @enum {string}
 */
const TileType = {
  MAP: 'map',
  VECTOR: 'vector',
};

/**
 * @typedef {Object} TileSet
 * @property {TileType} dataType Type of data represented in the tileset.
 * @property {string} [tileMatrixSetDefinition] Reference to a tile matrix set definition.
 * @property {TileMatrixSet} [tileMatrixSet] Tile matrix set definition.
 * @property {Array<TileMatrixSetLimits>} [tileMatrixSetLimits] Tile matrix set limits.
 * @property {Array<Link>} links Tileset links.
 */

/**
 * @typedef {Object} Link
 * @property {string} rel The link rel attribute.
 * @property {string} href The link URL.
 * @property {string} type The link type.
 */

/**
 * @typedef {Object} TileMatrixSetLimits
 * @property {string} tileMatrix The tile matrix id.
 * @property {number} minTileRow The minimum tile row.
 * @property {number} maxTileRow The maximum tile row.
 * @property {number} minTileCol The minimum tile column.
 * @property {number} maxTileCol The maximum tile column.
 */

/**
 * @typedef {Object} TileMatrixSet
 * @property {string} id The tile matrix set identifier.
 * @property {string} crs The coordinate reference system.
 * @property {Array<TileMatrix>} tileMatrices Array of tile matrices.
 */

/**
 * @typedef {Object} TileMatrix
 * @property {string} id The tile matrix identifier.
 * @property {number} cellSize The pixel resolution (map units per pixel).
 * @property {Array<number>} pointOfOrigin The map location of the matrix origin.
 * @property {string} [cornerOfOrigin='topLeft'] The corner of the matrix that represents the origin ('topLeft' or 'bottomLeft').
 * @property {number} matrixWidth The number of columns.
 * @property {number} matrixHeight The number of rows.
 * @property {number} tileWidth The pixel width of a tile.
 * @property {number} tileHeight The pixel height of a tile.
 */

/**
 * @type {Object<string, boolean>}
 */
const knownMapMediaTypes = {
  'image/png': true,
  'image/jpeg': true,
  'image/gif': true,
  'image/webp': true,
};

/**
 * @type {Object<string, boolean>}
 */
const knownVectorMediaTypes = {
  'application/vnd.mapbox-vector-tile': true,
  'application/geo+json': true,
};

/**
 * @typedef {Object} TileSetInfo
 * @property {string} urlTemplate The tile URL template.
 * @property {import("../tilegrid/TileGrid.js").default} grid The tile grid.
 * @property {import("../Tile.js").UrlFunction} urlFunction The tile URL function.
 */

/**
 * @typedef {Object} SourceInfo
 * @property {string} url The tile set URL.
 * @property {string} mediaType The preferred tile media type.
 * @property {import("../proj/Projection.js").default} projection The source projection.
 * @property {Object} [context] Optional context for constructing the URL.
 */

const BOTTOM_LEFT_ORIGIN = 'bottomLeft';

/**
 * @param {Array<Link>} links Tileset links.
 * @param {string} [mediaType] The preferred media type.
 * @return {string} The tile URL template.
 */
export function getMapTileUrlTemplate(links, mediaType) {
  let tileUrlTemplate;
  let fallbackUrlTemplate;
  for (let i = 0; i < links.length; ++i) {
    const link = links[i];
    if (link.rel === 'item') {
      if (link.type === mediaType) {
        tileUrlTemplate = link.href;
        break;
      }
      if (knownMapMediaTypes[link.type]) {
        fallbackUrlTemplate = link.href;
      } else if (!fallbackUrlTemplate && link.type.indexOf('image/') === 0) {
        fallbackUrlTemplate = link.href;
      }
    }
  }

  if (!tileUrlTemplate) {
    if (fallbackUrlTemplate) {
      tileUrlTemplate = fallbackUrlTemplate;
    } else {
      throw new Error('Could not find "item" link');
    }
  }

  return tileUrlTemplate;
}

/**
 * @param {Array<Link>} links Tileset links.
 * @param {string} [mediaType] The preferred media type.
 * @return {string} The tile URL template.
 */
export function getVectorTileUrlTemplate(links, mediaType) {
  let tileUrlTemplate;
  let fallbackUrlTemplate;
  for (let i = 0; i < links.length; ++i) {
    const link = links[i];
    if (link.rel === 'item') {
      if (link.type === mediaType) {
        tileUrlTemplate = link.href;
        break;
      }
      if (knownVectorMediaTypes[link.type]) {
        fallbackUrlTemplate = link.href;
      }
    }
  }

  if (!tileUrlTemplate) {
    if (fallbackUrlTemplate) {
      tileUrlTemplate = fallbackUrlTemplate;
    } else {
      throw new Error('Could not find "item" link');
    }
  }

  return tileUrlTemplate;
}

/**
 * @param {SourceInfo} sourceInfo Source info.
 * @return {Promise<TileSetInfo>} Tile set info.
 */
export function getTileSetInfo(sourceInfo) {
  let tileUrlTemplate;

  /**
   * @param {TileMatrixSet} tileMatrixSet Tile matrix set.
   * @return {TileSetInfo} Tile set info.
   */
  function parseTileMatrixSet(tileMatrixSet) {
    let projection = sourceInfo.projection;
    if (!projection) {
      projection = getProjection(tileMatrixSet.crs);
      if (!projection) {
        throw new Error(`Unsupported CRS: ${tileMatrixSet.crs}`);
      }
    }
    const backwards = projection.getAxisOrientation().substr(0, 2) !== 'en';

    // TODO: deal with limits
    const matrices = tileMatrixSet.tileMatrices;
    const length = matrices.length;
    const origins = new Array(length);
    const resolutions = new Array(length);
    const sizes = new Array(length);
    const tileSizes = new Array(length);
    for (let i = 0; i < matrices.length; ++i) {
      const matrix = matrices[i];
      const origin = matrix.pointOfOrigin;
      if (backwards) {
        origins[i] = [origin[1], origin[0]];
      } else {
        origins[i] = origin;
      }
      resolutions[i] = matrix.cellSize;
      sizes[i] = [matrix.matrixWidth, matrix.matrixHeight];
      tileSizes[i] = [matrix.tileWidth, matrix.tileHeight];
    }

    const tileGrid = new TileGrid({
      origins: origins,
      resolutions: resolutions,
      sizes: sizes,
      tileSizes: tileSizes,
    });

    const context = sourceInfo.context;
    const base = sourceInfo.url;

    function tileUrlFunction(tileCoord, pixelRatio, projection) {
      if (!tileCoord) {
        return undefined;
      }

      const matrix = matrices[tileCoord[0]];
      const upsideDown = matrix.cornerOfOrigin === BOTTOM_LEFT_ORIGIN;

      const localContext = {
        tileMatrix: matrix.id,
        tileCol: tileCoord[1],
        tileRow: upsideDown ? -tileCoord[2] - 1 : tileCoord[2],
      };
      assign(localContext, context);

      const url = tileUrlTemplate.replace(/\{(\w+?)\}/g, function (m, p) {
        return localContext[p];
      });

      return resolveUrl(base, url);
    }

    return {
      grid: tileGrid,
      urlTemplate: tileUrlTemplate,
      urlFunction: tileUrlFunction,
    };
  }

  /**
   * @param {TileSet} tileSet Tile set.
   * @return {TileSetInfo|Promise<TileSetInfo>} Tile set info.
   */
  function parseTileSetMetadata(tileSet) {
    if (tileSet.dataType === TileType.MAP) {
      tileUrlTemplate = getMapTileUrlTemplate(
        tileSet.links,
        sourceInfo.mediaType
      );
    } else if (tileSet.dataType === TileType.VECTOR) {
      tileUrlTemplate = getVectorTileUrlTemplate(
        tileSet.links,
        sourceInfo.mediaType
      );
    } else {
      throw new Error('Expected tileset data type to be "map" or "vector"');
    }

    if (tileSet.tileMatrixSet) {
      return parseTileMatrixSet(tileSet.tileMatrixSet);
    }

    if (!tileSet.tileMatrixSetDefinition) {
      throw new Error('Expected tileMatrixSetDefinition or tileMatrixSet');
    }

    const url = resolveUrl(sourceInfo.url, tileSet.tileMatrixSetDefinition);
    return getJSON(url).then(parseTileMatrixSet);
  }

  return getJSON(sourceInfo.url).then(parseTileSetMetadata);
}
