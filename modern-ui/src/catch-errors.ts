window.addEventListener('error', (event) => {
  fetch('http://localhost:5173/__error', {
    method: 'POST',
    body: JSON.stringify({ message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, error: event.error?.stack })
  }).catch(() => {})
});
