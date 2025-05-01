import { CubicSpline } from './spline.js';
import { generateSmoothCurve as generateSmoothCurveLinear } from './uv-utils.js'; // Linear fallback

let uvChart = null; // Keep track of the chart instance locally within this module

// Helper function to get color by segment
function getSegmentColor(ctx, type, uvColors) {
  const value = ctx.p0.parsed.y;
  // Use standard UV index thresholds
  if (value < 4) return type === 'line' ? uvColors.low.lineColor : uvColors.low.fillColor; // Green
  if (value < 6) return type === 'line' ? uvColors.moderate.lineColor : uvColors.moderate.fillColor; // Yellow
  if (value < 8) return type === 'line' ? uvColors.high.lineColor : uvColors.high.fillColor; // Orange
  if (value < 11) return type === 'line' ? uvColors.veryHigh.lineColor : uvColors.veryHigh.fillColor; // Red/Pink
  return type === 'line' ? uvColors.extreme.lineColor : uvColors.extreme.fillColor; // Purple
}

// Function to generate a smooth curve using cubic spline
// Returns smooth values/times and specific timestamps for axis ticks
function generateSmoothCurveWithSpline(uvReadings, uvRiseTime, uvFallTime) {
  if (!uvReadings || uvReadings.length < 2) {
    console.error('Cannot generate smooth curve: insufficient data');
    // Fall back to original data as points
    return {
      times: uvReadings.map(reading => {
        const date = new Date(reading.utc);
        return date.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Dubai' // Display in local time
        });
      }),
      values: uvReadings.map(reading => reading.uv)
    };
  }

  try {
    // Prepare data for interpolation
    const x = uvReadings.map(r => new Date(r.utc).getTime()); // ms since epoch
    const y = uvReadings.map(r => r.uv);

    console.log('Prepared data for spline:', {
      timeRange: [new Date(x[0]).toISOString(), new Date(x[x.length-1]).toISOString()],
      uvRange: [Math.min(...y), Math.max(...y)],
      points: x.length
    });

    // Create spline using our direct implementation
    console.log('Creating CubicSpline instance');
    const spline = new CubicSpline(x, y);
    console.log('CubicSpline instance created successfully');

    // Generate smoothed points (every 10 minutes)
    const start = x[0];
    const end = x[x.length - 1];
    const step = 10 * 60 * 1000; // 10 minutes in ms for curve smoothness

    const smoothTimes = []; // Times corresponding to smoothValues (10 min intervals)
    const smoothValues = []; // Interpolated UV values (10 min intervals)
    const pointsToInclude = new Map(); // Use Map to store { timeStr: timestamp } for unique, sorted labels

    // Add first point
    const startTimeStr = formatTime(start);
    pointsToInclude.set(startTimeStr, start);

    // Generate the smooth curve points (still needed for drawing)
    for (let t = start; t <= end; t += step) {
      const uv = spline.at(t);
      const timeStr = formatTime(t);
      smoothTimes.push(timeStr);
      smoothValues.push(uv);
      // Don't add hourly marks here anymore
    }

    // Explicitly add points on the hour for axis labels
    let currentHourTimestamp = new Date(start);
    currentHourTimestamp.setMinutes(0, 0, 0); // Start at the beginning of the hour
    // Move to the *next* hour if start wasn't exactly on the hour
    if (new Date(start).getMinutes() !== 0 || new Date(start).getSeconds() !== 0 || new Date(start).getMilliseconds() !== 0) {
        currentHourTimestamp.setHours(currentHourTimestamp.getHours() + 1);
    }

    while (currentHourTimestamp.getTime() < end) {
        const hourStr = formatTime(currentHourTimestamp.getTime());
        pointsToInclude.set(hourStr, currentHourTimestamp.getTime());
        currentHourTimestamp.setHours(currentHourTimestamp.getHours() + 1);
    }

    // Ensure specific rise/fall times are included in the axis labels
    if (uvRiseTime) {
      const riseTimestamp = timeStringToTimestamp(uvRiseTime, start);
      if (riseTimestamp) pointsToInclude.set(uvRiseTime, riseTimestamp);
    }
    if (uvFallTime) {
        const fallTimestamp = timeStringToTimestamp(uvFallTime, start);
        if (fallTimestamp) pointsToInclude.set(uvFallTime, fallTimestamp);
    }

    // Add last point
    const endTimeStr = formatTime(end);
    pointsToInclude.set(endTimeStr, end);

    // Sort the labels by timestamp
    const sortedPoints = Array.from(pointsToInclude.entries())
                              .sort(([, tsA], [, tsB]) => tsA - tsB);

    // Extract the sorted time strings for labels
    const sortedLabels = sortedPoints.map(([timeStr]) => timeStr);

    // Calculate the UV value for each specific axis label time using the spline
    const axisValues = sortedPoints.map(([, timestamp]) => spline.at(timestamp));

    // Extract the sorted timestamps for tick generation
    const axisTimestamps = sortedPoints.map(([, timestamp]) => timestamp);

    console.log(`Generated ${smoothValues.length} smooth points for curve drawing`);
    console.log('Generated axis timestamps:', axisTimestamps.map(ts => formatTime(ts))); // Log formatted times

    // Return necessary data
    return { times: smoothTimes, values: smoothValues, axisTimestamps: axisTimestamps };
  } catch (error) {
    console.error('Error generating smooth curve with spline:', error);
    console.log('Falling back to linear interpolation after error');

    // Fall back to linear interpolation if spline fails
    // Prepare data correctly for the linear fallback function
    const fallbackData = uvReadings.map(reading => {
      const date = new Date(reading.utc);
      return {
        time: date.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Dubai'
        }),
        uv: reading.uv
      };
    });
    // Extract times and values into separate arrays
    const fallbackTimes = fallbackData.map(d => d.time);
    const fallbackValues = fallbackData.map(d => d.uv);

    // Call the linear function with correct arguments
    return generateSmoothCurveLinear(fallbackTimes, fallbackValues);
  }
}

// Helper function to format timestamp to HH:MM
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dubai'
  });
}

// Restore helper function needed for converting HH:MM strings

// Helper function to convert HH:MM back to a timestamp (approximate for sorting)
// Needs a reference timestamp (like the start time) to infer the date.
function timeStringToTimestamp(timeStr, referenceTimestamp) {
    if (!timeStr) return null;
    try {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const refDate = new Date(referenceTimestamp);
        // Set hours/minutes based on the timeStr, keeping the date from reference
        // Note: This assumes times are within the same day as the reference start time.
        // Adjustments might be needed if data spans midnight.
        const targetDate = new Date(refDate);
        targetDate.setHours(hours, minutes, 0, 0); // Set time, clear seconds/ms

        // Handle potential day rollovers (e.g., if start is 23:00 and timeStr is 01:00)
        // This basic version assumes same day - might need refinement for edge cases.

        return targetDate.getTime();
    } catch (e) {
        console.error(`Error converting time string ${timeStr} to timestamp:`, e);
        return null;
    }
}

// Helper function to format timestamp to ham/pm
function formatTimeAmPm(timestamp) {
  const date = new Date(timestamp);
  let hours = date.getHours(); // Use local hours based on timezone
  const minutes = date.getMinutes(); // Keep minutes for precision if needed, but not in output format
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  // const minutesStr = minutes < 10 ? '0'+minutes : minutes; // If you wanted minutes: `${hours}:${minutesStr}${ampm}`
  return `${hours}${ampm}`; // Return format like "9am", "1pm"
}

// Update UV chart
function updateUvChart(canvas, uvReadings, currentUv, currentTime, uvRiseTime, uvFallTime) {
  if (!canvas) return null;

  console.log('updateUvChart received times:', { uvRiseTime, uvFallTime });

  if (uvChart) {
    uvChart.destroy();
    uvChart = null;
  }

  const smoothData = generateSmoothCurveWithSpline(uvReadings, uvRiseTime, uvFallTime);

  console.log('Generated smoothData.times for curve:', smoothData.times);
  console.log('Generated axisTimestamps for ticks:', smoothData.axisTimestamps);

  // Convert 10-min interval times to timestamps for plotting on time axis
  const plotData = smoothData.times.map((timeStr, index) => {
      // Use the start time of the dataset as reference for converting HH:MM back to timestamp
      const refTimestamp = timeStringToTimestamp(smoothData.times[0], Date.now()); // Use current time as fallback ref
      return {
          x: timeStringToTimestamp(timeStr, refTimestamp), 
          y: smoothData.values[index]
      };
  }).filter(p => p.x !== null); // Filter out any points that failed conversion

  // Find visual crossing points from the plotData for annotation positioning
  let visualRiseTimestamp = null;
  let visualFallTimestamp = null;
  let firstAboveThresholdIndex = -1;
  let lastAboveThresholdIndex = -1;

  for (let i = 0; i < plotData.length; i++) {
      if (plotData[i].y >= 4) {
          if (firstAboveThresholdIndex === -1) {
              firstAboveThresholdIndex = i;
          }
          lastAboveThresholdIndex = i;
      }
  }

  // Visual rise is the timestamp of the first point >= 4
  if (firstAboveThresholdIndex > 0) { // Need point before it to confirm rise
      visualRiseTimestamp = plotData[firstAboveThresholdIndex].x;
  } else if (firstAboveThresholdIndex === 0 && plotData[0].y >=4) {
       visualRiseTimestamp = plotData[0].x; // Rises at the very start
  }
  
  // Visual fall is the timestamp of the point *before* the last point >= 4 becomes < 4
  // So, it's the timestamp of the last point that was still >= 4
  if (lastAboveThresholdIndex !== -1 && lastAboveThresholdIndex < plotData.length -1) {
       visualFallTimestamp = plotData[lastAboveThresholdIndex].x; 
  } else if (lastAboveThresholdIndex === plotData.length -1 && plotData[lastAboveThresholdIndex].y >=4) {
      visualFallTimestamp = plotData[lastAboveThresholdIndex].x; // Ends above threshold
  }
  
  console.log("Visual crossing timestamps for annotation positioning:", { visualRiseTimestamp: formatTime(visualRiseTimestamp), visualFallTimestamp: formatTime(visualFallTimestamp) });

  const ctx = canvas.getContext('2d');

  const uvColors = {
    low: { lineColor: 'rgba(76, 175, 80, 1)', fillColor: 'rgba(76, 175, 80, 0.8)' },       // Green
    moderate: { lineColor: 'rgba(255, 235, 59, 1)', fillColor: 'rgba(255, 235, 59, 0.8)' }, // Yellow
    high: { lineColor: 'rgba(255, 152, 0, 1)', fillColor: 'rgba(255, 152, 0, 0.8)' },      // Orange
    veryHigh: { lineColor: 'rgba(233, 30, 99, 1)', fillColor: 'rgba(233, 30, 99, 0.8)' },   // Pink/red
    extreme: { lineColor: 'rgba(156, 39, 176, 1)', fillColor: 'rgba(156, 39, 176, 0.8)' } // Purple
  };

  const annotations = {};

  // Threshold line (keep)
  annotations.threshold = {
      type: 'line', yMin: 4, yMax: 4,
      borderColor: 'rgba(255, 152, 0, 0.8)', borderWidth: 2, borderDash: [5, 5],
      label: { content: 'Protection Level', enabled: true, position: 'end',
               backgroundColor: 'rgba(255, 152, 0, 0.8)', color: 'white', padding: 4, font: { size: 10 } }
  };

  // Prepare the datasets - Ensure marker dataset is added
  const datasets = [{
          label: '',
          data: plotData,
          segment: {
            borderColor: ctx => getSegmentColor(ctx, 'line', uvColors),
            backgroundColor: ctx => getSegmentColor(ctx, 'fill', uvColors),
          },
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
          order: 2 // Ensure main line is behind marker
      }]
      // Restore call to add the current time marker dataset
      .concat(generateCurrentTimeMarkerDataset(plotData, currentUv, currentTime));

  uvChart = new Chart(ctx, {
    type: 'line',
    data: {
      // No labels needed here for time axis, data provides x values
      // labels: smoothData.axisLabels, 
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, right: 10, bottom: 30, left: 5 } },
      scales: {
        x: {
          // Switch to time axis
          type: 'time',
          time: {
              unit: 'minute', // Base unit
              tooltipFormat: 'HH:mm', // Format for tooltips
              displayFormats: {
                  minute: 'HH:mm', // Format for ticks if needed
                  hour: 'HH:mm'     // Ensure hour ticks also use HH:mm
              }
          },
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            color: '#333',
            font: { size: 10 },
            autoSkip: false, // Disable auto skipping again
            maxTicksLimit: 15, // Limit ticks to prevent overlap
            callback: function(value, index, ticks) {
              // value is the timestamp
              // Format using the new am/pm helper
              return formatTimeAmPm(value);
            }
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: smoothData.values.length > 0 ? Math.max(6, Math.ceil(Math.max(...smoothData.values) * 1.1)) : 6,
          ticks: {
            stepSize: 2,
            color: '#333',
            font: { size: 10 },
            callback: function(value) {
              return value === 0 ? '' : value;
            }
          },
          grid: {
            color: 'rgba(200, 200, 200, 0.3)'
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
            callbacks: {
                title: function(tooltipItems) {
                    // Format timestamp from the first item for the title
                    if (tooltipItems.length > 0) {
                        const timestamp = tooltipItems[0].parsed.x;
                        return formatTime(timestamp);
                    }
                    return '';
                },
                label: function(context) {
                    // Use parsed.y for the UV value
                    const uvValue = context.parsed.y;
                    if (uvValue !== null) {
                         // Check if it's the marker point dataset by its label
                        if (context.dataset.label === 'Current Time') {
                            return `Current UV: ${uvValue.toFixed(1)}`;
                        }
                        return `UV Index: ${uvValue.toFixed(1)}`;
                    }
                    return ''; 
                }
            }
        },
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });

  return uvChart;
}

// Restore current time marker dataset function
function generateCurrentTimeMarkerDataset(plotData, currentUv, currentTime) {
    if (currentUv === null || !plotData || plotData.length === 0) {
        return [];
    }

    const currentTimestamp = currentTime.getTime();
    
    // Find the closest plot data point index
    let closestIndex = -1;
    let minDiff = Infinity;
    for (let i = 0; i < plotData.length; i++) {
        if (plotData[i].x === null) continue; // Skip null timestamps
        const diff = Math.abs(plotData[i].x - currentTimestamp);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }

    // Interpolate the UV value at the exact current time
    let interpolatedCurrentUv = null;
    for (let i = 0; i < plotData.length - 1; i++) {
        const p1 = plotData[i];
        const p2 = plotData[i + 1];
        if (p1.x !== null && p2.x !== null && currentTimestamp >= p1.x && currentTimestamp <= p2.x) {
            const fraction = (currentTimestamp - p1.x) / (p2.x - p1.x);
            if (isFinite(fraction)) { // Avoid division by zero if timestamps are identical
                 interpolatedCurrentUv = p1.y + fraction * (p2.y - p1.y);
            }
            break;
        }
    }
    // If outside range or couldn't interpolate, use the passed currentUv 
    if (interpolatedCurrentUv === null) {
        interpolatedCurrentUv = currentUv;
    }

    // Create marker data - only one point needs a value
    if (interpolatedCurrentUv !== null) {
        const markerData = [{ x: currentTimestamp, y: interpolatedCurrentUv }];

        return [{
            label: 'Current Time',
            data: markerData, // Data is an array of {x, y} points
            pointStyle: 'rectRot', // Rotated square
            pointRadius: 8,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointBackgroundColor: '#000',
            pointHoverRadius: 10,
            showLine: false,
            order: 1 // Ensure marker dataset draws on top
        }];
    } else {
        console.warn("Could not create current time marker.");
        return [];
    }
}

export { updateUvChart }; 