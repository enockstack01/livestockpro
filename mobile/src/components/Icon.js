import { FontAwesome6 } from '@expo/vector-icons';
import { COLORS } from '../lib/shared';

/* Thin wrapper defaulting to the "solid" style — the web app's icons are all
   Font Awesome 6 Free *Solid* (`<i className="fas fa-...">`, see
   client/index.html's cdnjs link), but @expo/vector-icons's FontAwesome6
   defaults to "regular" weight if iconStyle isn't passed, which reads
   visibly thinner/different from web. Icon names match web's `fa-*` class
   names 1:1 (just without the `fa-` prefix) so the two platforms render the
   same glyph for the same concept everywhere. Pass variant="brand" for logo
   glyphs (e.g. Google's "G") — those only exist in the brands font. */
export default function Icon({ name, size = 20, color = COLORS.text, style, variant = 'solid' }) {
  return <FontAwesome6 name={name} size={size} color={color} iconStyle={variant} style={style} />;
}
