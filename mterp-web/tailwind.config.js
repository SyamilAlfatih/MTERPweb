/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--primary)",
          light: "var(--primary-light)",
          bg: "var(--primary-bg)",
        },
        bg: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          white: "var(--bg-white)",
        },
        border: {
          DEFAULT: "var(--border)",
          light: "var(--border-light)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        semantic: {
          success: "var(--success)",
          "success-bg": "var(--success-bg)",
          warning: "var(--warning)",
          "warning-bg": "var(--warning-bg)",
          danger: "var(--danger)",
          "danger-bg": "var(--danger-bg)",
          info: "var(--info)",
          "info-bg": "var(--info-bg)",
        }
      },
      boxShadow: {
        'hypr': '0 0 15px var(--shadow-primary)',
        'hypr-sm': '0 0 8px var(--shadow-primary)',
      },
      borderRadius: {
        'hypr': '12px',
      }
    },
  },
  plugins: [],
}
