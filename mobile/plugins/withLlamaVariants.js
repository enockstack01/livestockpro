const { withGradleProperties } = require('expo/config-plugins');

/* Limits the llama.rn native variants (the on-phone Gemma model, src/ml/gemma)
   to the CPU builds. The Snapdragon "hexagon_opencl" variant needs Qualcomm's
   Hexagon SDK and the app runs Gemma on the CPU anyway (n_gpu_layers 0); its
   long object paths also pass the Windows 260 character limit and stop the
   build. Phones load the best CPU variant they support at run time. */
const VARIANTS = [
  'rnllama',
  'rnllama_v8',
  'rnllama_v8_2',
  'rnllama_v8_2_dotprod',
  'rnllama_v8_2_i8mm',
  'rnllama_v8_2_dotprod_i8mm',
  'rnllama_x86_64'
].join(',');

/* The APK carries every Android CPU type, so it installs on 32-bit phones
   (armeabi-v7a, x86) as well as 64-bit ones. llama.rn has no 32-bit build:
   there the offline AI is simply not offered (gemma.native.js supported()),
   and the photo check, the records and the online AI work as everywhere. */
const ARCHITECTURES = 'armeabi-v7a,arm64-v8a,x86,x86_64';

module.exports = function withLlamaVariants(config) {
  return withGradleProperties(config, (cfg) => {
    const ours = ['rnllamaVariants', 'reactNativeArchitectures'];
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && ours.includes(item.key)));
    cfg.modResults.push({ type: 'property', key: 'rnllamaVariants', value: VARIANTS });
    cfg.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: ARCHITECTURES });
    return cfg;
  });
};
