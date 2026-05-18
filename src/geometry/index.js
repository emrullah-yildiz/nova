import { Geo } from './geometry-lib.js';
import './geo-advanced.js';
import './nurbs-math.js';

if (typeof window !== 'undefined') {
  window.Geo = Geo;
}

export { Geo };
export default Geo;
