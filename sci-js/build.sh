#!/bin/bash

# Command to build the project
clj -A:shadow-cljs release sci-js

# Command to copy the built file to the desired location
cp dist/sci.js ../lib/sci.js
