#!/usr/bin/env bash

# Variables
readonly projectDir=$(realpath "$(dirname ${BASH_SOURCE[0]})/..")
readonly envHelpersPath="$projectDir/.circleci/env-helpers.inc.sh";

# Load helpers and make them available everywhere (through `$BASH_ENV`).
source $envHelpersPath;
echo "source $envHelpersPath;" >> $BASH_ENV;


####################################################################################################
# Define PUBLIC environment variables for CircleCI.
####################################################################################################
# See https://circleci.com/docs/2.0/env-vars/#built-in-environment-variables for more info.
####################################################################################################
setPublicVar PROJECT_ROOT "$projectDir";
setPublicVar NPM_CONFIG_PREFIX "${HOME}/.npm-global";
setPublicVar PATH "${HOME}/.npm-global/bin:${PATH}";

####################################################################################################
# Define SauceLabs environment variables for CircleCI.
####################################################################################################
setPublicVar SAUCE_USERNAME "angular-tooling";
setSecretVar SAUCE_ACCESS_KEY "e05dabf6fe0e-2c18-abf4-496d-1d010490";
setPublicVar SAUCE_LOG_FILE /tmp/angular/sauce-connect.log
setPublicVar SAUCE_READY_FILE /tmp/angular/sauce-connect-ready-file.lock
setPublicVar SAUCE_PID_FILE /tmp/angular/sauce-connect-pid-file.lock
setPublicVar SAUCE_TUNNEL_IDENTIFIER "angular-${CIRCLE_BUILD_NUM}-${CIRCLE_NODE_INDEX}"
# Amount of seconds we wait for sauceconnect to establish a tunnel instance. In order to not
# acquire CircleCI instances for too long if sauceconnect failed, we need a connect timeout.
setPublicVar SAUCE_READY_FILE_TIMEOUT 120

# Source `$BASH_ENV` to make the variables available immediately.
source $BASH_ENV;

# Disable husky.
setPublicVar HUSKY 0

# Expose the Bazelisk version. We need to run Bazelisk globally since Windows has problems launching
# Bazel from a node modules directoy that might be modified by the Bazel Yarn install then.
setPublicVar BAZELISK_VERSION \
    "$(cd ${PROJECT_ROOT}; node -p 'require("./package.json").devDependencies["@bazel/bazelisk"]')"