'use client';

import React from 'react';

interface AvatarDisplayProps {
  avatar: string;
  className?: string;
}

const AvatarDisplay: React.FC<AvatarDisplayProps> = ({ avatar, className = '' }) => {
  const isUrl = avatar?.startsWith('http');

  if (isUrl) {
    return (
      <div className={`overflow-hidden rounded-full ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={avatar} 
          alt="Avatar" 
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      {avatar}
    </div>
  );
};

export default AvatarDisplay;
