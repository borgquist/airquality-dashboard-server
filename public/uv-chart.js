// Simple UV Chart Renderer
document.addEventListener('DOMContentLoaded', function() {
  // Get chart canvas
  const canvas = document.getElementById('uvForecastGraph');
  if (!canvas) return;
  
  // Create and render the chart
  renderUVChart();
  
  // Re-render on window resize
  window.addEventListener('resize', function() {
    renderUVChart();
  });
  
  function renderUVChart() {
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions to match its container for proper responsive behavior
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = Math.max(250, container.clientHeight);
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set up dimensions with margins
    const margin = { top: 10, right: 10, bottom: 30, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Define UV data (simplified curve similar to the image)
    const dataPoints = 100;
    const uvData = [];
    
    // Generate a curve that rises and falls, peaking in the middle
    for (let i = 0; i < dataPoints; i++) {
      const x = i / (dataPoints - 1);
      // Create a curve that peaks at x=0.5 with max value of 12
      let y;
      if (x < 0.2) {
        // Gradual rise at start (0 to 2)
        y = (x / 0.2) * 2;
      } else if (x < 0.4) {
        // Steeper rise (2 to 12)
        y = 2 + ((x - 0.2) / 0.2) * 10;
      } else if (x < 0.6) {
        // Plateau at max (12)
        y = 12;
      } else if (x < 0.8) {
        // Steep fall (12 to 2)
        y = 12 - ((x - 0.6) / 0.2) * 10;
      } else {
        // Gradual fall to end (2 to 0)
        y = 2 - ((x - 0.8) / 0.2) * 2;
      }
      uvData.push({ x: x, y: y });
    }
    
    // Draw background areas
    const safeThreshold = 4;
    
    // Find y-position for threshold
    const yScale = chartHeight / 14; // Max UV is 14
    const thresholdY = height - margin.bottom - (safeThreshold * yScale);
    
    // Draw red area (unsafe)
    ctx.fillStyle = 'rgb(255, 200, 200)';
    ctx.fillRect(margin.left, margin.top, chartWidth, thresholdY - margin.top);
    
    // Draw green area (safe)
    ctx.fillStyle = 'rgb(200, 255, 200)';
    ctx.fillRect(margin.left, thresholdY, chartWidth, height - margin.bottom - thresholdY);
    
    // Draw "SAFE UV LEVELS" text in the green area
    ctx.fillStyle = 'rgba(46, 204, 113, 0.8)';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SAFE UV LEVELS', margin.left + chartWidth / 2, height - margin.bottom - 10);
    
    // Draw the threshold line
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.moveTo(margin.left, thresholdY);
    ctx.lineTo(margin.left + chartWidth, thresholdY);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw the UV curve
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom - (uvData[0].y * yScale));
    
    for (let i = 1; i < uvData.length; i++) {
      const x = margin.left + (uvData[i].x * chartWidth);
      const y = height - margin.bottom - (uvData[i].y * yScale);
      ctx.lineTo(x, y);
    }
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Draw X-axis (without labels)
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(margin.left + chartWidth, height - margin.bottom);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Draw x-axis title
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = '12px Arial';
    ctx.fillText('Daylight Hours (Local Time)', margin.left + chartWidth / 2, height - 5);
    
    // Draw Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Draw Y-axis title
    ctx.save();
    ctx.translate(10, margin.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('UV Index', 0, 0);
    ctx.restore();
    
    // Draw some y-axis tick marks
    const yTicks = [0, 4, 8, 12];
    yTicks.forEach(tick => {
      const y = height - margin.bottom - (tick * yScale);
      
      // Tick line
      ctx.beginPath();
      ctx.moveTo(margin.left - 5, y);
      ctx.lineTo(margin.left, y);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Tick label
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'right';
      ctx.fillText(tick.toString(), margin.left - 8, y + 4);
    });
  }
}); 