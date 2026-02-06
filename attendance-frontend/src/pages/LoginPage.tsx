import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Logo from '@/assets/Logo.png';
import { Eye, EyeOff } from 'lucide-react';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { user } = useAuth();

    // If already authenticated, send to dashboard.
    useEffect(() => {
        if (user) {
            navigate('/', { replace: true });
        }
    }, [user, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            toast.success('Login successful');
            navigate('/', { replace: true });
        } catch (err: any) {
            console.error(err);
            const code = err?.code || '';
            let friendly = 'Wrong email or password.';
            if (code === 'auth/user-disabled') friendly = 'Account disabled. Please contact admin.';
            else if (code === 'auth/user-not-found') friendly = 'No account found with that email.';
            else if (code === 'auth/too-many-requests') friendly = 'Too many attempts. Please try again later.';
            toast.error(friendly);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-muted/50">
            <Card className="w-full max-w-sm">
                <CardHeader className="flex flex-col items-center space-y-3 text-center">
                    <img src={Logo} alt="Barbaza MPC Attendance System logo" className="h-12 w-auto object-contain" />
                    <div className="space-y-1">
                        <CardTitle className="text-2xl font-bold">Attendance System</CardTitle>
                        <CardDescription>Login to manage cooperative attendance</CardDescription>
                    </div>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Email</label>
                            <Input
                                type="email"
                                placeholder="admin@barbazampc.coop"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Password</label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pr-10"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none"
                                    aria-pressed={showPassword}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            className="w-full bg-[#2c2a9c] hover:bg-[#241f7a] text-white"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
};

export default LoginPage;
