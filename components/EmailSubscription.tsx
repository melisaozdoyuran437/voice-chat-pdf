import React, { useState, useEffect } from 'react';

const EmailSubscription = () => {
  const [showTopRightBar, setShowTopRightBar] = useState(true);
  const [email, setEmail] = useState('');
  const [isValid, setIsValid] = useState(true);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // Timer to collapse the top bar after 15 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showTopRightBar && !isSubmitted) {
        setShowTopRightBar(false);
      }
    }, 15000); // 15 seconds
    
    return () => clearTimeout(timer);
  }, [showTopRightBar, isSubmitted]);
  
  // Basic email validation
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateEmail(email)) {
      setIsValid(false);
      return;
    }
    
    // Here you would typically send the email to your backend
    console.log('Email submitted from top bar:', email);
    setIsSubmitted(true);
    
    // Hide top bar after submission with a short delay
    setTimeout(() => {
      setShowTopRightBar(false);
      setEmail('');
      setIsValid(true);
    }, 2000);
  };
  
  const handleButtonClick = () => {
    // Instead of opening popup, just show the top bar again
    setShowTopRightBar(true);
    setIsSubmitted(false);
  };

  return (
    <>
      {/* Top right bar email input - shows for first 15 seconds or until submitted */}
      {showTopRightBar && (
        <div
          style={{
            position: 'fixed',
            top: '10px',
            right: '20px',
            width: '700px',
            maxWidth: '90%',
            padding: '8px 14px',
            backgroundColor: 'rgba(16, 16, 24, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(183, 82, 255, 0.3)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 990,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
            animation: 'fadeIn 0.5s ease-out',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
           
            <span style={{ color: '#ffffff', fontWeight: '500', fontSize: '14px', whiteSpace: 'nowrap' }}>
              Stay updated during this meeting
            </span>
          </div>
          
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', flexGrow: 1, marginLeft: '36px' }}>
              <div style={{ position: 'relative', flexGrow: 1 }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setIsValid(true); // Reset validation on change
                  }}
                  placeholder="Enter your email address"
                  style={{
                    width: '80%',
                    padding: '8px 16px 8px 36px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(28, 17, 35, 0.7)',
                    border: isValid 
                      ? '1px solid rgba(255, 255, 255, 0.1)' 
                      : '1px solid rgba(255, 99, 99, 0.7)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(183, 82, 255, 0.5)';
                    e.target.style.boxShadow = '0 0 0 2px rgba(183, 82, 255, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = isValid 
                      ? 'rgba(255, 255, 255, 0.1)' 
                      : 'rgba(255, 99, 99, 0.7)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {/* Email icon inside input */}
                <div style={{ 
                  position: 'absolute', 
                  left: '12px', 
                  top: '50%', 
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none' 
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="#B752FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M22 6L12 13L2 6" stroke="#B752FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                
                {!isValid && (
                  <div style={{ 
                    position: 'absolute',
                    bottom: '-20px',
                    left: '4px',
                    color: '#ff6363', 
                    fontSize: '12px',
                  }}>
                    Please enter a valid email
                  </div>
                )}
              </div>
              
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #B752FF, #8349FF)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(183, 82, 255, 0.3)',
                  whiteSpace: 'nowrap',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(183, 82, 255, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(183, 82, 255, 0.3)';
                }}
              >
                Subscribe
              </button>
            </form>
          ) : (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              color: '#50e3c2',
              fontSize: '14px',
              fontWeight: '500',
              marginLeft: '16px',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17L4 12" stroke="#50e3c2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Thank you! We'll keep you updated.
            </div>
          )}
          
          {/* Close button for top bar */}
          <button
            onClick={() => setShowTopRightBar(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#B0B0C0',
              marginLeft: '12px',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ×
          </button>
        </div>
      )}
      
      {/* Contact Button with blinking arrow - shows after top bar is hidden */}
      {!showTopRightBar && (
        <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', alignItems: 'center', gap: '2px' }}>
          {/* Blinking left arrow */}
          <div 
            style={{ 
              animation: 'blink 1.5s infinite', 
              display: 'flex', 
              alignItems: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 19L5 12L12 5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          
          {/* "Stay Connected" button */}
          <button
            onClick={handleButtonClick}
            style={{
              padding: '10px 16px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(183, 82, 255, 0.2), rgba(131, 73, 255, 0.2))',
              border: '1px solid rgba(183, 82, 255, 0.3)',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              zIndex: 5,
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
              animation: 'fadeIn 0.3s ease-out',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(183, 82, 255, 0.3), rgba(131, 73, 255, 0.3))';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(183, 82, 255, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(183, 82, 255, 0.2), rgba(131, 73, 255, 0.2))';
              e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="#B752FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 6L12 13L2 6" stroke="#B752FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Stay Connected
          </button>
        </div>
      )}
      
      {/* CSS animations */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          @keyframes blink {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}
      </style>
    </>
  );
};

export default EmailSubscription;