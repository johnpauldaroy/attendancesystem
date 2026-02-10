import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '@/lib/api';

interface UserData {
    id: number | string;
    name: string;
    email: string;
    role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'STAFF' | 'APPROVER';
    branch_id: number | string | null;
    status: 'ACTIVE' | 'INACTIVE';
    branch?: {
        id: number | string;
        name: string;
        code: string;
    };
}

interface AuthContextType {
    user: UserData | null;
    login: (token: string, userData: UserData) => void;
    logout: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('auth_token');
            const savedUser = localStorage.getItem('user_data');

            if (token && savedUser) {
                try {
                    const userData = JSON.parse(savedUser) as UserData;
                    setUser(userData);

                    // Verify token and get fresh data
                    const response = await api.get('/me');
                    if (response.data) {
                        setUser(response.data);
                        localStorage.setItem('user_data', JSON.stringify(response.data));
                    }
                } catch (error) {
                    console.error('Auth initialization failed:', error);
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user_data');
                    setUser(null);
                }
            }
            setIsLoading(false);
        };

        initAuth();
    }, []);

    const login = (token: string, userData: UserData) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user_data', JSON.stringify(userData));
        setUser(userData);
    };

    const logout = async () => {
        try {
            await api.post('/logout');
        } catch (error) {
            console.error('Logout failed', error);
        } finally {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
