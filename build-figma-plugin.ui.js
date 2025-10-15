module.exports = function (buildOptions) {
  return {
    ...buildOptions,
    define: {
      global: 'window'
    },
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat'
    }
  }
}
