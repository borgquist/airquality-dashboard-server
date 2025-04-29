// UV Index module for handling UV data and charts

// Add cubic spline implementation
class CubicSpline {
  constructor(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) {
      throw new Error("Cubic spline needs at least 2 points and equal-length arrays");
    }
    
    // Sort points by x if needed
    const points = xs.map((x, i) => ({ x, y: ys[i] })).sort((a, b) => a.x - b.x);
    this.xs = points.map(p => p.x);
    this.ys = points.map(p => p.y);
    
    const n = this.xs.length;
    
    // Build the tridiagonal system
    // h[i] = x[i+1] - x[i]
    const h = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      h[i] = this.xs[i + 1] - this.xs[i];
      if (h[i] <= 0) {
        throw new Error("Cubic spline needs strictly increasing x values");
      }
    }
    
    // alpha[i] = 3/h[i] * (y[i+1] - y[i]) - 3/h[i-1] * (y[i] - y[i-1])
    const alpha = new Array(n - 1).fill(0);
    for (let i = 1; i < n - 1; i++) {
      alpha[i] = 3 / h[i] * (this.ys[i + 1] - this.ys[i]) - 
                 3 / h[i - 1] * (this.ys[i] - this.ys[i - 1]);
    }
    
    // Solve the tridiagonal system
    // Initialize arrays
    this.c = new Array(n).fill(0);  // Natural boundary conditions: c[0] = c[n-1] = 0
    const l = new Array(n).fill(0);
    const mu = new Array(n).fill(0);
    const z = new Array(n).fill(0);
    
    // Forward sweep
    l[0] = 1;
    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (this.xs[i + 1] - this.xs[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    l[n - 1] = 1;
    
    // Back substitution
    for (let j = n - 2; j >= 0; j--) {
      this.c[j] = z[j] - mu[j] * this.c[j + 1];
    }
    
    // Calculate the remaining coefficients
    this.b = new Array(n - 1);
    this.d = new Array(n - 1);
    
    for (let i = 0; i < n - 1; i++) {
      this.b[i] = (this.ys[i + 1] - this.ys[i]) / h[i] - 
                 h[i] * (this.c[i + 1] + 2 * this.c[i]) / 3;
      this.d[i] = (this.c[i + 1] - this.c[i]) / (3 * h[i]);
    }
    
    console.log("Cubic spline coefficients calculated");
  }
  
  // Evaluate spline at point x
  at(x) {
    // Handle out-of-range x values
    if (x <= this.xs[0]) return this.ys[0];
    if (x >= this.xs[this.xs.length - 1]) return this.ys[this.ys.length - 1];
    
    // Binary search to find the correct interval
    let i = 0;
    let j = this.xs.length - 1;
    
    while (j - i > 1) {
      const m = Math.floor((i + j) / 2);
      if (this.xs[m] > x) {
        j = m;
      } else {
        i = m;
      }
    }
    
    // Now xs[i] <= x < xs[i+1]
    const dx = x - this.xs[i];
    
    // Evaluate cubic polynomial
    return this.ys[i] + 
           this.b[i] * dx + 
           this.c[i] * dx * dx + 
           this.d[i] * dx * dx * dx;
  }
}

// Fetch the UV index data from the server
async function fetchUvIndexData(forceRefresh = false, isSseEvent = false) {
  try {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const url = `/api/uvindex?_=${timestamp}${forceRefresh ? '&force=1' : ''}${isSseEvent ? '&_sse=1' : ''}`;
    console.log(`Fetching UV index data with${forceRefresh ? ' forced refresh' : ' normal request'}${isSseEvent ? ' (SSE initiated)' : ''}: ${url}`);
    
    const response = await fetch(url, {
      cache: forceRefresh ? 'no-store' : 'default',
      headers: {
        'Cache-Control': forceRefresh ? 'no-cache' : 'default',
        'Pragma': forceRefresh ? 'no-cache' : 'default'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("UV Data received:", data);
    
    // Store the data for future reference
    lastUvData = data;
    
    // Update the display - this creates the UV box if it doesn't exist
    updateUvIndexDisplay(data);
    
    debugPrint(`UV data updated: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error('Error fetching UV index data:', error);
  }
}

// Update the UV index display
function updateUvIndexDisplay(data) {
  if (!data || data.error || !data.result || !data.result.length) {
    console.warn('Invalid UV data format or error:', data?.error || 'No result array');
    
    // Still update the display with empty values
    document.getElementById('uvCurrentValue').textContent = '-';
    document.getElementById('uvCurrentClass').textContent = '-';
    document.getElementById('uvRiseTime').textContent = 'Rise above 4: --:--';
    document.getElementById('uvFallTime').textContent = 'Fall below 4: --:--';
    return;
  }
  
  console.log("Processing UV data with", data.result.length, "readings");
  
  // Process UV data - prepare it for cubic spline by using epoch time
  const uvReadings = data.result.map(item => ({
    utc: item.uv_time,  // Keep full ISO string for accurate time processing
    uv: item.uv
  }));
  
  // Find crossings for UV index of 4 (moderate threshold)
  const uvRiseTime = findUvCrossing(uvReadings, 4, "rising");
  const uvFallTime = findUvCrossing(uvReadings, 4, "falling");
  
  // Get current UV level
  const currentTime = new Date();
  const currentUv = getCurrentUvLevel(uvReadings, currentTime);
  
  // Update UV value display
  const uvCurrentValue = document.getElementById('uvCurrentValue');
  if (uvCurrentValue) {
    uvCurrentValue.textContent = currentUv !== null ? currentUv.toFixed(1) : '-';
  }
  
  // Update UV class display
  const uvCurrentClass = document.getElementById('uvCurrentClass');
  if (uvCurrentClass) {
    uvCurrentClass.textContent = getUvCategoryName(currentUv);
    
    // Remove all category classes
    uvCurrentClass.classList.remove('uv-low', 'uv-moderate', 'uv-high', 'uv-very-high', 'uv-extreme');
    
    // Add appropriate class
    const uvClass = getUvClass(currentUv);
    if (uvClass) {
      uvCurrentClass.classList.add(uvClass);
    }
    
    // Also add class to parent .uv-box
    const uvBox = document.querySelector('.uv-box');
    if (uvBox) {
      uvBox.classList.remove('uv-low', 'uv-moderate', 'uv-high', 'uv-very-high', 'uv-extreme');
      if (uvClass) {
        uvBox.classList.add(uvClass);
      }
    }
  }
  
  // Update crossing times
  const uvRiseElement = document.getElementById('uvRiseTime');
  const uvFallElement = document.getElementById('uvFallTime');
  
  if (uvRiseElement) {
    uvRiseElement.textContent = uvRiseTime ? `Rise above 4: ${uvRiseTime}` : 'Rise above 4: --:--';
  }
  
  if (uvFallElement) {
    uvFallElement.textContent = uvFallTime ? `Fall below 4: ${uvFallTime}` : 'Fall below 4: --:--';
  }
  
  // Update UV info with recommendations
  const uvInfo = document.getElementById('uvInfo');
  if (uvInfo) {
    uvInfo.innerHTML = getUvInfoAndRecommendations(currentUv);
  }
  
  // Update chart
  updateUvChart(uvReadings, uvRiseTime, uvFallTime);
}

// Update UV chart
function updateUvChart(uvReadings, uvRiseTime, uvFallTime) {
  const canvas = document.getElementById('uvChart');
  if (!canvas) return;
  
  // Clean up previous chart if it exists
  if (uvChart) {
    uvChart.destroy();
  }
  
  // Generate smooth curve using cubic spline interpolation
  const smoothData = generateSmoothCurveWithSpline(uvReadings);
  
  // Create annotations for rise and fall times
  const annotations = {};
  
  if (uvRiseTime) {
    annotations.riseTime = {
      type: 'line',
      xMin: uvRiseTime,
      xMax: uvRiseTime,
      borderColor: 'rgba(255, 152, 0, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        content: `UV > 4 at ${uvRiseTime}`,
        enabled: true,
        position: 'top',
        backgroundColor: 'rgba(255, 152, 0, 0.8)',
        color: 'white',
        padding: 4
      }
    };
  }
  
  if (uvFallTime) {
    annotations.fallTime = {
      type: 'line',
      xMin: uvFallTime,
      xMax: uvFallTime,
      borderColor: 'rgba(76, 175, 80, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        content: `UV < 4 at ${uvFallTime}`,
        enabled: true,
        position: 'top',
        backgroundColor: 'rgba(76, 175, 80, 0.8)',
        color: 'white',
        padding: 4
      }
    };
  }
  
  // Add horizontal threshold line at UV=4
  annotations.threshold = {
    type: 'line',
    yMin: 4,
    yMax: 4,
    borderColor: 'rgba(255, 152, 0, 0.8)',
    borderWidth: 2,
    borderDash: [5, 5],
    label: {
      content: 'Protection Level',
      enabled: true,
      position: 'end',
      backgroundColor: 'rgba(255, 152, 0, 0.8)',
      color: 'white',
      padding: 4
    }
  };
  
  // Create chart
  const ctx = canvas.getContext('2d');
  uvChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: smoothData.times,
      datasets: [
        {
          label: 'UV Index',
          data: smoothData.values,
          borderColor: 'rgba(233, 30, 99, 0.8)',
          backgroundColor: 'rgba(233, 30, 99, 0.2)',
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            color: '#333'
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(...smoothData.values) * 1.1,
          ticks: {
            stepSize: 2,
            color: '#333'
          },
          grid: {
            color: 'rgba(200, 200, 200, 0.3)'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          titleColor: 'white',
          bodyColor: 'white',
          callbacks: {
            title: function(tooltipItems) {
              return tooltipItems[0].label;
            },
            label: function(context) {
              return `UV Index: ${context.raw.toFixed(1)}`;
            }
          }
        },
        annotation: {
          annotations: annotations
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  });
}

// Function to generate a smooth curve using cubic spline
function generateSmoothCurveWithSpline(uvReadings) {
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
    const step = 10 * 60 * 1000; // 10 minutes in ms
    
    const smoothTimes = [];
    const smoothValues = [];
    
    for (let t = start; t <= end; t += step) {
      // Interpolate UV value at this time
      const uv = spline.at(t);
      
      // Format time for display
      const timeStr = new Date(t).toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Asia/Dubai' // Display in local time
      });
      
      smoothTimes.push(timeStr);
      smoothValues.push(uv);
    }
    
    console.log(`Generated ${smoothTimes.length} smooth points using cubic spline`);
    console.log('Sample points:', smoothValues.slice(0, 3), '...', smoothValues.slice(-3));
    return { times: smoothTimes, values: smoothValues };
  } catch (error) {
    console.error('Error generating smooth curve with spline:', error);
    console.log('Falling back to linear interpolation after error');
    
    // Fall back to linear interpolation if spline fails
    return generateSmoothCurve(uvReadings.map(reading => {
      const date = new Date(reading.utc);
      return {
        utc: date.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'Asia/Dubai'
        }),
        uv: reading.uv
      };
    }));
  }
}

// Find the UV crossing time using cubic spline interpolation
function findUvCrossing(uvReadings, targetUV, direction = "rising") {
  if (!uvReadings || uvReadings.length < 2) {
    return null;
  }
  
  try {
    // Prepare data for interpolation
    const x = uvReadings.map(r => new Date(r.utc).getTime()); // ms since epoch
    const y = uvReadings.map(r => r.uv);
    
    // Create spline
    const spline = new CubicSpline(x, y);
    
    // Using cubic spline to find the crossing
    for (let i = 0; i < uvReadings.length - 1; i++) {
      const t1 = new Date(uvReadings[i].utc).getTime();
      const t2 = new Date(uvReadings[i+1].utc).getTime();
      const uv1 = uvReadings[i].uv;
      const uv2 = uvReadings[i+1].uv;
      
      // Check if there's a potential crossing
      const isCrossingRange = (direction === "rising" && uv1 < targetUV && uv2 > targetUV) ||
                             (direction === "falling" && uv1 > targetUV && uv2 < targetUV);
      
      if (isCrossingRange) {
        // Search for precise crossing using binary search within this interval
        let tLow = t1;
        let tHigh = t2;
        let tMid, uvMid;
        
        // Binary search for crossing within 1-minute precision
        while (tHigh - tLow > 60000) { // 1 minute = 60000 ms
          tMid = Math.floor((tLow + tHigh) / 2);
          uvMid = spline.at(tMid);
          
          if ((direction === "rising" && uvMid < targetUV) ||
              (direction === "falling" && uvMid > targetUV)) {
            tLow = tMid;
          } else {
            tHigh = tMid;
          }
        }
        
        // Convert to formatted time
        const crossingTime = new Date((tLow + tHigh) / 2);
        const timeStr = crossingTime.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Dubai'
        });
        
        return timeStr;
      }
    }
    
    return null; // No crossing found
  } catch (error) {
    console.error('Error in findUvCrossing:', error);
    
    // Fall back to the original linear method
    return findCrossing(uvReadings.map(reading => {
      const date = new Date(reading.utc);
      return {
        utc: date.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'Asia/Dubai'
        }),
        uv: reading.uv
      };
    }), targetUV, direction);
  }
}

// Get current UV level based on cubic spline interpolation
function getCurrentUvLevel(uvReadings, currentTime) {
  if (!uvReadings || uvReadings.length === 0) return null;
  
  try {
    // Prepare data for interpolation
    const x = uvReadings.map(r => new Date(r.utc).getTime()); // ms since epoch
    const y = uvReadings.map(r => r.uv);
    
    // Current time in ms
    const now = currentTime.getTime();
    
    // Check if current time is within our data range
    if (now < x[0] || now > x[x.length - 1]) {
      // Outside range - get closest value
      return now < x[0] ? y[0] : y[y.length - 1];
    }
    
    // Create spline and get interpolated value
    const spline = new CubicSpline(x, y);
    return spline.at(now);
  } catch (error) {
    console.error('Error in getCurrentUvLevel:', error);
    
    // Fall back to original method
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    // Find surrounding data points
    for (let i = 0; i < uvReadings.length - 1; i++) {
      const t1 = new Date(uvReadings[i].utc);
      const t2 = new Date(uvReadings[i+1].utc);
      
      const t1Minutes = t1.getHours() * 60 + t1.getMinutes();
      const t2Minutes = t2.getHours() * 60 + t2.getMinutes();
      
      if (currentMinutes >= t1Minutes && currentMinutes <= t2Minutes) {
        // Linear interpolation
        const fraction = (currentMinutes - t1Minutes) / (t2Minutes - t1Minutes);
        return uvReadings[i].uv + fraction * (uvReadings[i+1].uv - uvReadings[i].uv);
      }
    }
    
    // Outside the range, get closest value
    const firstTime = new Date(uvReadings[0].utc);
    const lastTime = new Date(uvReadings[uvReadings.length - 1].utc);
    
    const firstMinutes = firstTime.getHours() * 60 + firstTime.getMinutes();
    const lastMinutes = lastTime.getHours() * 60 + lastTime.getMinutes();
    
    if (currentMinutes < firstMinutes) return uvReadings[0].uv;
    if (currentMinutes > lastMinutes) return uvReadings[uvReadings.length - 1].uv;
  }
  
  return null;
}

// Get UV category name
function getUvCategoryName(uvValue) {
  if (uvValue === null) return '-';
  if (uvValue < 3) return 'Low';
  if (uvValue < 6) return 'Moderate';
  if (uvValue < 8) return 'High';
  if (uvValue < 11) return 'Very High';
  return 'Extreme';
}

// Get UV recommendations
function getUvInfoAndRecommendations(uvValue) {
  if (uvValue === null) return '';
  
  let recommendations = '';
  
  if (uvValue < 3) {
    recommendations = 'Low risk. No protection needed for most people.';
  } else if (uvValue < 6) {
    recommendations = 'Moderate risk. Wear sunscreen SPF 30+, hat, and sunglasses.';
  } else if (uvValue < 8) {
    recommendations = 'High risk. Stay in shade during midday hours. Use SPF 30+ sunscreen, hat, and sunglasses.';
  } else if (uvValue < 11) {
    recommendations = 'Very high risk. Minimize sun exposure between 10am and 4pm. Apply SPF 30+ every 2 hours.';
  } else {
    recommendations = 'Extreme risk. Avoid outdoors during midday hours. Shirt, sunscreen, hat, and sunglasses are essential.';
  }
  
  return `<p>${recommendations}</p>`;
}

// Generate additional points for a smoother curve (fallback for linear interpolation)
function generateSmoothCurve(times, values) {
  if (times.length !== values.length || times.length < 2) {
    return { times, values };
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
    
    // How many points to add between (more points for wider time gaps)
    const pointsToAdd = Math.max(5, Math.ceil((endTime - startTime) / 5));
    
    for (let j = 0; j <= pointsToAdd; j++) {
      const fraction = j / pointsToAdd;
      const currentMinutes = startTime + fraction * (endTime - startTime);
      const currentValue = startValue + fraction * (endValue - startValue);
      
      smoothTimes.push(minutesToTime(currentMinutes));
      smoothValues.push(currentValue);
    }
  }
  
  // Add last point if needed
  if (smoothTimes[smoothTimes.length - 1] !== times[times.length - 1]) {
    smoothTimes.push(times[times.length - 1]);
    smoothValues.push(values[values.length - 1]);
  }
  
  return { times: smoothTimes, values: smoothValues };
}

// Find the interpolated crossing time (fallback method)
function findCrossing(uvReadings, targetUV, direction = "rising") {
  for (let i = 0; i < uvReadings.length - 1; i++) {
    const current = uvReadings[i];
    const next = uvReadings[i + 1];

    if ((direction === "rising" && current.uv < targetUV && next.uv >= targetUV) ||
        (direction === "falling" && current.uv > targetUV && next.uv <= targetUV)) {

      const uvDelta = next.uv - current.uv;
      const timeDelta = timeToMinutes(next.utc) - timeToMinutes(current.utc);
      const fraction = (targetUV - current.uv) / uvDelta;
      const interpolatedMinutes = timeToMinutes(current.utc) + (fraction * timeDelta);

      return minutesToTime(interpolatedMinutes); // Already in local time
    }
  }
  return null; // No crossing found
}

// Convert "HH:MM" string to minutes since midnight
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

// Convert minutes since midnight to "HH:MM" string
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Get UV index class for styling
function getUvClass(uvValue) {
  if (uvValue === null) return '';
  if (uvValue < 3) return 'uv-low';
  if (uvValue < 6) return 'uv-moderate';
  if (uvValue < 8) return 'uv-high';
  if (uvValue < 11) return 'uv-very-high';
  return 'uv-extreme';
} 