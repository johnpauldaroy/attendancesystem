import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

interface UserData {
    id?: string; // Firestore ID
    name: string;
    email: string;
    role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'STAFF' | 'APPROVER';
    branch_id: number | string | null;
    status?: 'ACTIVE' | 'INACTIVE';
    branch?: {
        id: number | string;
        name: string;
        code: string;
    };
}

// Combine Firebase User with our custom data
interface AuthContextType {
    user: (FirebaseUser & UserData) | null;
    logout: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<(FirebaseUser & UserData) | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Fetch additional user details from Firestore
                try {
                    const userDocRef = doc(db, 'users', firebaseUser.uid);
                    const userDoc = await getDoc(userDocRef);

                    if (userDoc.exists()) {
                        const userData = userDoc.data() as UserData;
                        if (userData.status === 'INACTIVE') {
                            console.warn('User is inactive, signing out.');
                            await signOut(auth);
                            setUser(null);
                            setIsLoading(false);
                            return;
                        }
                        console.log('🔍 User Data from Firestore:', userData);
                        console.log('🔍 Branch ID:', userData.branch_id, 'Type:', typeof userData.branch_id);
                        setUser({ ...firebaseUser, ...userData });
                    } else {
                        // Fallback if no user doc (shouldn't happen in prod if properly seeded)
                        console.warn('User document not found for', firebaseUser.uid);
                        setUser({
                            ...firebaseUser,
                            name: firebaseUser.displayName || 'Unknown',
                            email: firebaseUser.email!,
                            role: 'STAFF',
                            branch_id: null,
                            status: 'ACTIVE'
                        });
                    }
                } catch (error) {
                    console.error('Error fetching user profile:', error);
                    // Still log them in, but maybe with limited access?
                    // For now, treat as simplistic user
                    setUser(firebaseUser as (FirebaseUser & UserData));
                }
            } else {
                setUser(null);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
