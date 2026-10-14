// Package builtin contains the default, in-process plugins shipped with the agent.
package builtin

import "errors"

var errUnsupported = errors.New("capability not supported")
