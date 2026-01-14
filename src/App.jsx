import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth'; // Adjust the import based on your auth context location
import Login from './Login';
import Register from './Register';
import StudentDashboard from './StudentDashboard';
import TutorDashboard from './TutorDashboard';


function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/login" element={
            isAuthenticated ? 
              (user?.role === 'tutor' ? <Navigate to="/tutor-dashboard" replace /> : 
               <Navigate to="/student-dashboard" replace />) 
              : <Login />
          } />
          <Route path="/register" element={
            isAuthenticated ? 
              (user?.role === 'tutor' ? <Navigate to="/tutor-dashboard" replace /> : 
               <Navigate to="/student-dashboard" replace />) 
              : <Register />
          } />
          <Route 
            path="/student-dashboard" 
            element={isAuthenticated && user?.role === 'student' ? 
              <StudentDashboard /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/tutor-dashboard" 
            element={isAuthenticated && user?.role === 'tutor' ? 
              <TutorDashboard /> : <Navigate to="/login" replace />} 
          />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;