// Animate counters
function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  const duration = 1200;
  const step = 16;
  const increment = target / (duration / step);
  let current = 0;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      el.textContent = target;
      clearInterval(timer);
    } else {
      el.textContent = Math.floor(current);
    }
  }, step);
}

document.querySelectorAll('.stat-number').forEach(el => {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(el);
        observer.disconnect();
      }
    });
  }, { threshold: 0.5 });
  observer.observe(el);
});

// Confetti burst
const COLORS = ['#6366f1','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b'];

function launchConfetti() {
  const container = document.getElementById('confetti-container');
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
    piece.style.width = (8 + Math.random() * 8) + 'px';
    piece.style.height = (10 + Math.random() * 10) + 'px';
    const dur = 1.8 + Math.random() * 1.4;
    const delay = Math.random() * 0.6;
    piece.style.animation = `fall ${dur}s ${delay}s linear forwards`;
    container.appendChild(piece);
    setTimeout(() => piece.remove(), (dur + delay) * 1000 + 100);
  }
}

document.getElementById('celebrate').addEventListener('click', () => {
  launchConfetti();
});

// Auto-celebrate on load after a short delay
window.addEventListener('load', () => {
  setTimeout(launchConfetti, 800);
});
