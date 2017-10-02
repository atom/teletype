const environments = []

exports.buildAtomEnvironment = function buildAtomEnvironment () {
  const env = global.buildAtomEnvironment()
  environments.push(env)
  return env
}

exports.destroyAtomEnvironments = function destroyAtomEnvironments () {
  const destroyPromises = environments.map((e) => e.destroy())
  environments.length = 0
  return Promise.all(destroyPromises)
}
