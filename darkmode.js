const darkModeToggle = document.getElementById('darkModeToggle');
const body = document.body;

function updateDarkMode() {
  if (darkModeToggle.checked) {
    body.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'enabled');
  } else {
    body.classList.remove('dark-mode');
    localStorage.setItem('darkMode', 'disabled');
  }
}


// Check for stored preference on load
const storedDarkMode = localStorage.getItem('darkMode');
if (storedDarkMode === 'enabled') {
  darkModeToggle.checked = true; // This line is still needed to set initial state
  body.classList.add('dark-mode');
} else {
  darkModeToggle.checked = false; // This line is still needed to set initial state
  body.classList.remove('dark-mode');
}

darkModeToggle.addEventListener('change', updateDarkMode);
