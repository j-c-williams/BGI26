import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Leaderboard from './pages/Leaderboard'
import WeekDetail from './pages/WeekDetail'
import Admin from './pages/Admin'
import CourseDesigner from './pages/CourseDesigner'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<Leaderboard />} />
        <Route path="/week/:id" element={<WeekDetail />} />
        <Route path="/admin"   element={<Admin />} />
        <Route path="/course"  element={<CourseDesigner />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
