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

module.exports = function withLlamaVariants(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === 'rnllamaVariants'));
    cfg.modResults.push({ type: 'property', key: 'rnllamaVariants', value: VARIANTS });
    return cfg;
  });
};
