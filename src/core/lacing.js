export function hasListInput(inputDefinitions, inputs) {
  return inputDefinitions.some(function(input) {
    return Array.isArray(inputs[input.id]);
  });
}

export function createLacingFrames(inputDefinitions, inputs, mode = 'shortest') {
  const listInputs = inputDefinitions
    .map(input => ({ id: input.id, value: inputs[input.id] }))
    .filter(input => Array.isArray(input.value));

  if (listInputs.length === 0) return [inputs];
  if (mode === 'crossProduct') return createCrossProductFrames(inputDefinitions, inputs, listInputs);

  const lengths = listInputs.map(input => input.value.length);
  const frameCount = mode === 'longest' ? Math.max(...lengths) : Math.min(...lengths);

  return Array.from({ length: frameCount }, function(_, index) {
    return inputDefinitions.reduce(function(frame, input) {
      const value = inputs[input.id];
      if (Array.isArray(value)) {
        const valueIndex = mode === 'longest' ? Math.min(index, value.length - 1) : index;
        frame[input.id] = value[valueIndex];
      } else {
        frame[input.id] = value;
      }
      return frame;
    }, {});
  });
}

function createCrossProductFrames(inputDefinitions, inputs, listInputs) {
  const primaryInput = listInputs[0];
  const secondaryInputs = listInputs.slice(1);

  if (secondaryInputs.length === 0) {
    return primaryInput.value.map(function(item) {
      return inputDefinitions.reduce(function(frame, input) {
        frame[input.id] = input.id === primaryInput.id ? item : inputs[input.id];
        return frame;
      }, {});
    });
  }

  return primaryInput.value.map(function(primaryItem) {
    const frames = [];

    function walk(listIndex, pickedValues) {
      if (listIndex >= secondaryInputs.length) {
        frames.push(inputDefinitions.reduce(function(frame, input) {
          if (input.id === primaryInput.id) {
            frame[input.id] = primaryItem;
            return frame;
          }

          frame[input.id] = pickedValues[input.id] !== undefined ? pickedValues[input.id] : inputs[input.id];
          return frame;
        }, {}));
        return;
      }

      const listInput = secondaryInputs[listIndex];
      listInput.value.forEach(function(item) {
        walk(listIndex + 1, { ...pickedValues, [listInput.id]: item });
      });
    }

    walk(0, {});
    return frames;
  });
}

export function mapLacingFrames(frames, mapper) {
  return frames.map(function(frame) {
    if (Array.isArray(frame)) {
      return frame.map(mapper);
    }
    return mapper(frame);
  });
}

export function forEachLacingFrame(frames, callback) {
  frames.forEach(function(frame, outerIndex) {
    if (Array.isArray(frame)) {
      frame.forEach(function(innerFrame, innerIndex) {
        callback(innerFrame, outerIndex, innerIndex);
      });
      return;
    }

    callback(frame, outerIndex, null);
  });
}

export function collectLacingFrameOutputs(outputIds, frames, executeFrame) {
  const framedOutputs = outputIds.reduce(function(outputs, outputId) {
    outputs[outputId] = [];
    return outputs;
  }, {});

  frames.forEach(function(frame) {
    if (Array.isArray(frame)) {
      const nestedOutputs = outputIds.reduce(function(outputs, outputId) {
        outputs[outputId] = [];
        return outputs;
      }, {});

      frame.forEach(function(innerFrame) {
        const output = executeFrame(innerFrame);
        outputIds.forEach(function(outputId) {
          nestedOutputs[outputId].push(output[outputId]);
        });
      });

      outputIds.forEach(function(outputId) {
        framedOutputs[outputId].push(nestedOutputs[outputId]);
      });
      return;
    }

    const output = executeFrame(frame);
    outputIds.forEach(function(outputId) {
      framedOutputs[outputId].push(output[outputId]);
    });
  });

  return framedOutputs;
}
