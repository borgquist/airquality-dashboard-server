// Utility functions for UV index processing

// Convert "HH:MM" string to minutes since midnight
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(":");
  if (parts.length !== 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

// Convert minutes since midnight to "HH:MM" string
function minutesToTime(minutes) {
  if (isNaN(minutes) || minutes < 0) return '00:00';
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Get UV category name
function getUvCategoryName(uvValue) {
  if (uvValue === null || uvValue === undefined || isNaN(uvValue)) return '-';
  if (uvValue < 3) return 'Low';
  if (uvValue < 6) return 'Moderate';
  if (uvValue < 8) return 'High';
  if (uvValue < 11) return 'Very High';
  return 'Extreme';
}

// Get UV index class for styling
function getUvClass(uvValue) {
  if (uvValue === null || uvValue === undefined || isNaN(uvValue)) return '';
  if (uvValue < 3) return 'uv-low';
  if (uvValue < 6) return 'uv-moderate';
  if (uvValue < 8) return 'uv-high';
  if (uvValue < 11) return 'uv-very-high';
  return 'uv-extreme';
}

// Generate additional points for a smoother curve (fallback for linear interpolation)
function generateSmoothCurve(times, values) {
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length || times.length < 2) {
    return { times: times || [], values: values || [] };
  }

  const smoothTimes = [];
  const smoothValues = [];

  // Convert times to minutes for interpolation
  const minutesTimes = times.map(time => timeToMinutes(time));

  // Add extra points between each original point
  for (let i = 0; i < times.length - 1; i++) {
    const startTime = minutesTimes[i];
    const endTime = minutesTimes[i + 1];
    const startValue = values[i];
    const endValue = values[i + 1];

    // Handle potential division by zero or non-numeric values
    if (isNaN(startTime) || isNaN(endTime) || isNaN(startValue) || isNaN(endValue)) {
      console.warn('Skipping interpolation due to invalid data', { startTime, endTime, startValue, endValue });
      continue;
    }

    // How many points to add between (more points for wider time gaps)
    const pointsToAdd = Math.max(5, Math.ceil(Math.abs(endTime - startTime) / 5));

    for (let j = 0; j <= pointsToAdd; j++) {
      const fraction = j / pointsToAdd;
      const currentMinutes = startTime + fraction * (endTime - startTime);
      const currentValue = startValue + fraction * (endValue - startValue);

      smoothTimes.push(minutesToTime(currentMinutes));
      smoothValues.push(currentValue);
    }
  }

  // Add last point if needed and it's valid
  if (times.length > 0 && smoothTimes[smoothTimes.length - 1] !== times[times.length - 1]) {
      if (!isNaN(values[values.length - 1])) {
        smoothTimes.push(times[times.length - 1]);
        smoothValues.push(values[values.length - 1]);
      } else {
         console.warn('Skipping last point due to invalid value', { time: times[times.length - 1], value: values[values.length - 1] });
      }
  }

  return { times: smoothTimes, values: smoothValues };
}

// Find the interpolated crossing time (fallback method)
function findCrossing(uvReadings, targetUV, direction = "rising") {
  if (!Array.isArray(uvReadings) || uvReadings.length < 2 || isNaN(targetUV)) {
      return null;
  }

  for (let i = 0; i < uvReadings.length - 1; i++) {
    const current = uvReadings[i];
    const next = uvReadings[i + 1];

    if (!current || !next || typeof current.uv !== 'number' || typeof next.uv !== 'number' || typeof current.utc !== 'string' || typeof next.utc !== 'string') {
        console.warn('Skipping crossing check due to invalid reading format', { current, next });
        continue;
    }

    const currentUV = current.uv;
    const nextUV = next.uv;

    const isRisingCrossing = direction === "rising" && currentUV < targetUV && nextUV >= targetUV;
    const isFallingCrossing = direction === "falling" && currentUV > targetUV && nextUV <= targetUV;

    if (isRisingCrossing || isFallingCrossing) {
        const uvDelta = nextUV - currentUV;
        if (uvDelta === 0) continue; // Avoid division by zero if UV doesn't change

        const currentMinutes = timeToMinutes(current.utc);
        const nextMinutes = timeToMinutes(next.utc);
        const timeDelta = nextMinutes - currentMinutes;

        // Handle cases where time might not be increasing or is invalid
        if (isNaN(timeDelta) || timeDelta <= 0) {
            console.warn('Skipping crossing calculation due to invalid time delta', { current, next, timeDelta });
            continue;
        }

        const fraction = (targetUV - currentUV) / uvDelta;
        const interpolatedMinutes = currentMinutes + (fraction * timeDelta);

        return minutesToTime(interpolatedMinutes);
    }
  }
  return null; // No crossing found
}

export {
  timeToMinutes,
  minutesToTime,
  getUvCategoryName,
  getUvClass,
  generateSmoothCurve,
  findCrossing
}; 