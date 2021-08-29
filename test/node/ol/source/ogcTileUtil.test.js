import TileGrid from '../../../../src/ol/tilegrid/TileGrid.js';
import events from 'events';
import expect from '../../expect.js';
import fse from 'fs-extra';
import path from 'path';
import {fileURLToPath} from 'url';
import {
  getMapTileUrlTemplate,
  getTileSetInfo,
  getVectorTileUrlTemplate,
} from '../../../../src/ol/source/ogcTileUtil.js';
import {overrideXHR, restoreXHR} from '../../../../src/ol/net.js';

function getDataDir() {
  const modulePath = fileURLToPath(import.meta.url);
  return path.join(path.dirname(modulePath), 'data');
}

let baseUrl;

class MockXHR extends events.EventEmitter {
  addEventListener(type, listener) {
    this.addListener(type, listener);
  }

  open(method, url) {
    if (url.startsWith(baseUrl)) {
      url = url.slice(baseUrl.length);
    }
    this.url = url;
  }

  setRequestHeader(key, value) {
    // no-op
  }

  send() {
    let url = path.resolve(getDataDir(), this.url);
    if (!url.endsWith('.json')) {
      url = url + '.json';
    }
    fse.readJSON(url).then(
      (data) => {
        this.status = 200;
        this.responseText = JSON.stringify(data);
        this.emit('load', {target: this});
      },
      (err) => {
        console.error(err); // eslint-disable-line
        this.emit('error', {target: this});
      }
    );
  }
}

describe('ol/source/ogcTileUtil.js', () => {
  describe('getTileSetInfo()', () => {
    beforeEach(() => {
      overrideXHR(MockXHR);
    });

    afterEach(() => {
      baseUrl = '';
      restoreXHR();
    });

    it('fetches and parses map tile info', async () => {
      baseUrl = 'https://maps.ecere.com/';
      const sourceInfo = {
        url: 'https://maps.ecere.com/ogcapi/collections/blueMarble/map/tiles/WebMercatorQuad',
      };
      const tileInfo = await getTileSetInfo(sourceInfo);
      expect(tileInfo).to.be.an(Object);
      expect(tileInfo.urlTemplate).to.be(
        '/ogcapi/collections/blueMarble/map/tiles/WebMercatorQuad/{tileMatrix}/{tileRow}/{tileCol}.jpg'
      );
      expect(tileInfo.grid).to.be.a(TileGrid);
      expect(tileInfo.grid.getTileSize(0)).to.eql([256, 256]);
      expect(tileInfo.grid.getResolutions()).to.have.length(30);
      expect(tileInfo.urlFunction).to.be.a(Function);
      expect(tileInfo.urlFunction([1, 2, 3])).to.be(
        'https://maps.ecere.com/ogcapi/collections/blueMarble/map/tiles/WebMercatorQuad/1/3/2.jpg'
      );
    });

    it('allows preferred media type to be configured', async () => {
      baseUrl = 'https://maps.ecere.com/';
      const sourceInfo = {
        url: 'https://maps.ecere.com/ogcapi/collections/blueMarble/map/tiles/WebMercatorQuad',
        mediaType: 'image/png',
      };
      const tileInfo = await getTileSetInfo(sourceInfo);
      expect(tileInfo).to.be.an(Object);
      expect(tileInfo.urlTemplate).to.be(
        '/ogcapi/collections/blueMarble/map/tiles/WebMercatorQuad/{tileMatrix}/{tileRow}/{tileCol}.png'
      );
      expect(tileInfo.urlFunction).to.be.a(Function);
      expect(tileInfo.urlFunction([1, 2, 3])).to.be(
        'https://maps.ecere.com/ogcapi/collections/blueMarble/map/tiles/WebMercatorQuad/1/3/2.png'
      );
    });

    it('fetches and parses vector tile info', async () => {
      baseUrl = 'https://maps.ecere.com/';
      const sourceInfo = {
        url: 'https://maps.ecere.com/ogcapi/collections/ne_10m_admin_0_countries/tiles/WebMercatorQuad',
      };
      const tileInfo = await getTileSetInfo(sourceInfo);
      expect(tileInfo).to.be.an(Object);
      expect(tileInfo.urlTemplate).to.be(
        '/ogcapi/collections/NaturalEarth:cultural:ne_10m_admin_0_countries/tiles/WebMercatorQuad/{tileMatrix}/{tileRow}/{tileCol}.json'
      );
      expect(tileInfo.grid).to.be.a(TileGrid);
      expect(tileInfo.grid.getTileSize(0)).to.eql([256, 256]);
      expect(tileInfo.grid.getResolutions()).to.have.length(30);
      expect(tileInfo.urlFunction).to.be.a(Function);
      expect(tileInfo.urlFunction([1, 2, 3])).to.be(
        'https://maps.ecere.com/ogcapi/collections/NaturalEarth:cultural:ne_10m_admin_0_countries/tiles/WebMercatorQuad/1/3/2.json'
      );
    });

    it('allows preferred media type to be configured', async () => {
      baseUrl = 'https://maps.ecere.com/';
      const sourceInfo = {
        url: 'https://maps.ecere.com/ogcapi/collections/ne_10m_admin_0_countries/tiles/WebMercatorQuad',
        mediaType: 'application/vnd.mapbox-vector-tile',
      };
      const tileInfo = await getTileSetInfo(sourceInfo);
      expect(tileInfo).to.be.an(Object);
      expect(tileInfo.urlTemplate).to.be(
        '/ogcapi/collections/NaturalEarth:cultural:ne_10m_admin_0_countries/tiles/WebMercatorQuad/{tileMatrix}/{tileRow}/{tileCol}.mvt'
      );
      expect(tileInfo.urlFunction).to.be.a(Function);
      expect(tileInfo.urlFunction([1, 2, 3])).to.be(
        'https://maps.ecere.com/ogcapi/collections/NaturalEarth:cultural:ne_10m_admin_0_countries/tiles/WebMercatorQuad/1/3/2.mvt'
      );
    });
  });

  describe('getVectorTileUrlTemplate()', () => {
    let links;
    before(async () => {
      const url = path.join(
        getDataDir(),
        'ogcapi/collections/ne_10m_admin_0_countries/tiles/WebMercatorQuad.json'
      );
      const tileSet = await fse.readJSON(url);
      links = tileSet.links;
    });

    it('gets the last known vector type if the preferred media type is absent', () => {
      const urlTemplate = getVectorTileUrlTemplate(links);
      expect(urlTemplate).to.be(
        '/ogcapi/collections/NaturalEarth:cultural:ne_10m_admin_0_countries/tiles/WebMercatorQuad/{tileMatrix}/{tileRow}/{tileCol}.json'
      );
    });

    it('gets the preferred media type if given', () => {
      const urlTemplate = getVectorTileUrlTemplate(
        links,
        'application/vnd.mapbox-vector-tile'
      );
      expect(urlTemplate).to.be(
        '/ogcapi/collections/NaturalEarth:cultural:ne_10m_admin_0_countries/tiles/WebMercatorQuad/{tileMatrix}/{tileRow}/{tileCol}.mvt'
      );
    });

    it('throws if it cannot find preferred media type or a known fallback', () => {
      function call() {
        getVectorTileUrlTemplate([], 'application/vnd.mapbox-vector-tile');
      }
      expect(call).to.throwException('Could not find "item" link');
    });
  });

  describe('getMapTileUrlTemplate()', () => {
    let links;
    before(async () => {
      const url = path.join(
        getDataDir(),
        'ogcapi/collections/blueMarble/map/tiles/WebMercatorQuad.json'
      );
      const tileSet = await fse.readJSON(url);
      links = tileSet.links;
    });

    it('gets the last known image type if the preferred media type is absent', () => {
      const urlTemplate = getMapTileUrlTemplate(links);
      expect(urlTemplate).to.be(
        '/ogcapi/collections/blueMarble/map/tiles/WebMercatorQuad/{tileMatrix}/{tileRow}/{tileCol}.jpg'
      );
    });

    it('gets the preferred media type if given', () => {
      const urlTemplate = getMapTileUrlTemplate(links, 'image/png');
      expect(urlTemplate).to.be(
        '/ogcapi/collections/blueMarble/map/tiles/WebMercatorQuad/{tileMatrix}/{tileRow}/{tileCol}.png'
      );
    });

    it('throws if it cannot find preferred media type or a known fallback', () => {
      function call() {
        getMapTileUrlTemplate([], 'image/png');
      }
      expect(call).to.throwException('Could not find "item" link');
    });
  });
});
