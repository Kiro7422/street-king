/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'neon-yellow': '#EAB308',
                'dark-bg': '#0F172A',
            }
        },
    },
    plugins: [],
}