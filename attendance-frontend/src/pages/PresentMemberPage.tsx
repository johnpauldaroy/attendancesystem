import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, ArrowLeft, Loader2, User, AlertTriangle, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

// Validation function to check for missing critical fields
const validateMemberData = (member: any) => {
    const criticalFields = [
        { key: 'birth_date', label: 'Birth Date' },
        { key: 'age', label: 'Age' },
        { key: 'contact_no', label: 'Contact Number' },
        { key: 'position', label: 'Position' },
        { key: 'tin_no', label: 'TIN #' },
        { key: 'sss_no', label: 'SSS #' },
        { key: 'gsis_no', label: 'GSIS #' },
        { key: 'unit_house_no', label: 'Unit/House No.' },
        { key: 'barangay_village', label: 'Barangay' },
        { key: 'city_town', label: 'Town/City' },
        { key: 'province', label: 'Province' },
        { key: 'address', label: 'Address' },
        { key: 'sex', label: 'Sex' },
        { key: 'civil_status', label: 'Civil Status' },
    ];

    const missing = criticalFields.filter(field => !member[field.key] || member[field.key] === '');
    return missing;
};

const PresentMemberPage = () => {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedMember, setSelectedMember] = useState<any>(null);
    type TodayStatus = 'APPROVED' | 'PENDING' | 'CANCELLED' | 'NONE';
    const [attendanceStatus, setAttendanceStatus] = useState<TodayStatus>('NONE');
    const [attendanceTodayId, setAttendanceTodayId] = useState<string | number | null>(null);
    const [showWarningDialog, setShowWarningDialog] = useState(false);
    const [showQuickRegisterDialog, setShowQuickRegisterDialog] = useState(false);
    const [isCreatingGuest, setIsCreatingGuest] = useState(false);
    const [guestData, setGuestData] = useState<{ full_name: string; contact_no: string; branch_id?: number | '' }>({
        full_name: '',
        contact_no: '',
    });
    const [missingFields, setMissingFields] = useState<any[]>([]);
    const navigate = useNavigate();
    const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);
    const { user } = useAuth();

    const toTodayStatus = (rawStatus: string | null | undefined): TodayStatus => {
        if (rawStatus === 'APPROVED' || rawStatus === 'PENDING' || rawStatus === 'CANCELLED') {
            return rawStatus;
        }
        return 'NONE';
    };

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 500);
        return () => clearTimeout(handler);
    }, [search]);

    // Server-side search for members
    const { data: searchResults, isLoading } = useQuery({
        queryKey: ['members-search', debouncedSearch],
        queryFn: async () => {
            const response = await api.get('/members/search', {
                params: { q: debouncedSearch, per_page: 20 }
            });
            // Laravel pagination returns data in .data.data
            return response.data.data;
        },
        enabled: true, // Fetch initial 20 if empty
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
    });

    const { data: branches } = useQuery({
        queryKey: ['branches'],
        queryFn: async () => {
            const res = await api.get('/branches');
            return res.data;
        },
        enabled: !!user,
        staleTime: 300_000,
        gcTime: 900_000,
        refetchOnWindowFocus: false,
    });

    const { data: todayStatusData } = useQuery({
        queryKey: ['attendance-today-status', selectedMember?.id, attendanceRefreshKey],
        queryFn: async () => {
            const response = await api.get('/attendance/today-status', {
                params: { member_id: selectedMember.id },
            });
            return response.data;
        },
        enabled: !!selectedMember?.id,
        staleTime: 10_000,
        gcTime: 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
    });

    const mutation = useMutation({
        mutationFn: async (member: any) => {
            const response = await api.post('/attendance', {
                member_id: member.id,
                attendance_date_time: new Date().toISOString(), // Laravel will handle local time
            });
            return response.data;
        },
        onSuccess: (data) => {
            toast.success(data.status === 'APPROVED' ? 'Attendance Approved!' : 'Attendance Submitted for Approval');

            setSelectedMember(null);
            setAttendanceRefreshKey((k) => k + 1);
            setAttendanceTodayId(data.id);
            setAttendanceStatus((data.status as TodayStatus) || 'NONE');
        },
        onError: (err: any) => {
            console.error(err);
            const msg = err.response?.data?.message || 'Failed to log attendance';
            toast.error(msg);
        },
    });

    const undoMutation = useMutation({
        mutationFn: async (attendanceId: string | number) => {
            await api.post(`/attendance/${attendanceId}/cancel`);
            return attendanceId;
        },
        onSuccess: () => {
            toast.success('Attendance log reverted successfully');
            setAttendanceStatus('NONE');
            setAttendanceTodayId(null);
            setAttendanceRefreshKey((k) => k + 1);
            setSelectedMember((prev: any) => prev ? { ...prev } : prev);
        },
        onError: (err: any) => {
            console.error('Undo failed', err);
            toast.error(err.response?.data?.message || 'Failed to undo attendance log');
        }
    });

    const handleLogAttendance = () => {
        if (!selectedMember) return;
        const missing = validateMemberData(selectedMember);
        if (missing.length > 0) {
            setMissingFields(missing);
            setShowWarningDialog(true);
        } else {
            mutation.mutate(selectedMember);
        }
    };

    const handleProceedAnyway = () => {
        setShowWarningDialog(false);
        mutation.mutate(selectedMember);
    };

    const handleQuickRegister = async () => {
        if (!guestData.full_name) {
            toast.error('Full Name is required');
            return;
        }

        setIsCreatingGuest(true);
        try {
            const memberResponse = await api.post('/members', {
                full_name: guestData.full_name,
                contact_no: guestData.contact_no,
                is_temporary: true,
                status: 'INCOMPLETE',
                origin_branch_id: guestData.branch_id || user?.branch_id || 1,
                cif_key: `TEMP-${Date.now()}`, // Backend should handle this, but providing a fallback
            });

            const newMember = memberResponse.data;
            setShowQuickRegisterDialog(false);
            setGuestData({ full_name: '', contact_no: '' });
            mutation.mutate(newMember);
        } catch (err: any) {
            console.error(err);
            toast.error(err.response?.data?.message || 'Failed to register member');
        } finally {
            setIsCreatingGuest(false);
        }
    };

    // Sync local UI state from cached today-status query.
    useEffect(() => {
        if (!selectedMember) {
            setAttendanceStatus('NONE');
            setAttendanceTodayId(null);
            return;
        }

        if (!todayStatusData) return;

        if (todayStatusData.attendance_id) {
            setAttendanceTodayId(todayStatusData.attendance_id);
            setAttendanceStatus(toTodayStatus(todayStatusData.status));
        } else {
            setAttendanceTodayId(null);
            setAttendanceStatus('NONE');
        }
    }, [selectedMember, todayStatusData]);

    return (
        <div className="min-h-screen bg-muted/30 pb-20 md:pb-8">
            <div className="container mx-auto max-w-6xl p-3 sm:p-4 space-y-4">
                <div className="flex items-center gap-3">
                    <Link to="/">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold font-heading">Log Attendance</h1>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or member number..."
                        className="pl-10 h-12 text-base"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="grid gap-4 md:gap-6 md:grid-cols-2 items-start">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle className="text-lg">Search Results</CardTitle>
                        </CardHeader>
                        <CardContent className="min-h-[45vh] max-h-[55vh] md:min-h-[60vh] md:max-h-[70vh] overflow-y-auto pr-2">
                            {isLoading ? (
                                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                            ) : searchResults && searchResults.length > 0 ? (
                                <div className="space-y-2">
                                    {searchResults.map((m: any) => {
                                        const missing = validateMemberData(m);
                                        return (
                                            <div
                                                key={m.id}
                                                className={`p-3 md:p-4 border rounded-lg cursor-pointer transition-colors ${selectedMember?.id === m.id
                                                    ? 'bg-[#fff9e5] border-[#f6c657] hover:bg-[#fff4d6] active:bg-[#ffe8ae]'
                                                    : 'hover:bg-[#f4f7ff] active:bg-[#e8f0ff]'
                                                    }`}
                                                onClick={() => setSelectedMember(m)}
                                            >
                                                <div className="flex flex-col sm:flex-row items-start gap-3">
                                                    <div className="flex-1 flex items-start gap-3 min-w-0">
                                                        <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                                            <User className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-semibold text-sm md:text-base truncate">{m.full_name}</div>
                                                            <div className="text-xs md:text-sm text-muted-foreground">{m.member_no}</div>
                                                            <div className="text-[11px] md:text-xs text-muted-foreground">
                                                                Branch: {m.origin_branch?.name || m.branch?.name || 'N/A'}
                                                            </div>
                                                            {missing.length > 0 && (
                                                                <div className="flex items-center gap-1 mt-1">
                                                                    <AlertTriangle className="h-3 w-3 text-orange-500" />
                                                                    <span className="text-xs text-orange-500">{missing.length} field(s) missing</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-row sm:flex-col flex-wrap items-center sm:items-end gap-1 sm:ml-auto w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-muted/50 mt-1 sm:mt-0">
                                                        <Badge
                                                            variant="secondary"
                                                            className="text-[10px] md:text-[11px] bg-[#f0f4ff] text-[#312e81] border-none hover:bg-[#e0e7ff] h-5 max-w-full break-words"
                                                        >
                                                            {m.segmentation || 'No segmentation'}
                                                        </Badge>
                                                        <Badge
                                                            variant="secondary"
                                                            className="text-[10px] md:text-[11px] bg-[#ecfdf5] text-[#047857] border-none hover:bg-[#d1fae5] h-5 max-w-full break-words"
                                                        >
                                                            {m.membership_status || 'No membership status'}
                                                        </Badge>
                                                        <Badge
                                                            variant="secondary"
                                                            className="text-[10px] md:text-[11px] bg-[#f0f9ff] text-[#0369a1] border-none hover:bg-[#e0f2fe] h-5 max-w-full break-words"
                                                        >
                                                            {m.representatives_status || m.representative_status || 'No representative status'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {debouncedSearch && (
                                        <div className="pt-4 border-t mt-4 flex flex-col items-center gap-2">
                                            <p className="text-xs text-muted-foreground text-center">
                                                Not in the list? Register them quickly below:
                                            </p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full border-dashed border-primary text-primary hover:bg-primary/5 h-11"
                                                onClick={() => {
                                                    setGuestData({ full_name: debouncedSearch, contact_no: '' });
                                                    setShowQuickRegisterDialog(true);
                                                }}
                                            >
                                                <Plus className="h-4 w-4 mr-2" />
                                                Register & Log Attendance
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center p-8 space-y-4">
                                    <p className="text-sm md:text-base text-muted-foreground">
                                        {debouncedSearch ? 'No members found matching your search.' : 'Type to search members...'}
                                    </p>
                                    {debouncedSearch && (
                                        <Button
                                            variant="outline"
                                            className="w-full border-dashed border-primary text-primary hover:bg-primary/5 h-11"
                                            onClick={() => {
                                                setGuestData({ full_name: debouncedSearch, contact_no: '' });
                                                setShowQuickRegisterDialog(true);
                                            }}
                                        >
                                            <Plus className="h-4 w-4 mr-2" />
                                            Register & Log Attendance
                                        </Button>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle className="text-lg">Member Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 md:space-y-6">
                            {selectedMember ? (
                                <div className="space-y-4 md:space-y-6">
                                    <div className="bg-white border border-muted rounded-lg p-3 md:p-4 flex flex-col gap-3 mb-4">
                                        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 justify-between">
                                            <div className="flex items-start gap-3 md:gap-4">
                                                <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-primary/10 flex items-center justify-center">
                                                    <User className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                                                </div>
                                                <div className="space-y-0.5 min-w-0">
                                                    <h3 className="text-base md:text-lg font-semibold leading-tight break-words">{selectedMember.full_name}</h3>
                                                    <p className="text-[11px] md:text-xs text-muted-foreground">{selectedMember.member_no}</p>
                                                    <p className="text-[11px] md:text-xs text-muted-foreground">
                                                        Branch: {selectedMember.origin_branch?.name || selectedMember.branch?.name || 'N/A'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 md:gap-3 justify-start md:justify-end items-start md:items-center w-full mt-2 pt-2 border-t border-muted/50 md:border-none md:pt-0 md:mt-0 md:w-auto md:ml-auto">
                                                <Badge variant="secondary" className="text-[10px] md:text-[11px] bg-[#f0f4ff] text-[#312e81] border-none h-6 max-w-full break-words">
                                                    {selectedMember.segmentation || 'No segmentation'}
                                                </Badge>
                                                <Badge variant="secondary" className="text-[10px] md:text-[11px] bg-[#ecfdf5] text-[#047857] border-none h-6 max-w-full break-words">
                                                    {selectedMember.membership_status || 'No membership status'}
                                                </Badge>
                                                <Badge variant="secondary" className="text-[10px] md:text-[11px] bg-[#f0f9ff] text-[#0369a1] border-none h-6 max-w-full break-words">
                                                    {selectedMember.representatives_status || selectedMember.representative_status || 'No representative status'}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-4 text-sm">
                                        <div>
                                            <div className="text-muted-foreground mb-0.5 text-[11px]">Contact</div>
                                            <div className="font-semibold">{selectedMember.contact_no || 'Not provided'}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-0.5 text-[11px]">Attendance Status</div>
                                            <Badge
                                                variant={
                                                    attendanceStatus === 'APPROVED'
                                                        ? 'default'
                                                        : attendanceStatus === 'PENDING'
                                                            ? 'secondary'
                                                            : attendanceStatus === 'CANCELLED'
                                                                ? 'destructive'
                                                                : 'secondary'
                                                }
                                                className="text-[10px] px-2 py-0.5"
                                            >
                                                {attendanceStatus === 'APPROVED' && 'PRESENT (today)'}
                                                {attendanceStatus === 'PENDING' && 'PENDING (today)'}
                                                {attendanceStatus === 'CANCELLED' && 'CANCELLED (today)'}
                                                {attendanceStatus === 'NONE' && 'Not logged today'}
                                            </Badge>
                                        </div>
                                    </div>

                                    {validateMemberData(selectedMember).length > 0 && (
                                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                                                <div>
                                                    <div className="font-semibold text-orange-900 text-sm">Incomplete Profile</div>
                                                    <div className="text-xs text-orange-700">
                                                        {validateMemberData(selectedMember).length} field(s) missing.
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="hidden md:block pt-2 space-y-2">
                                        {attendanceStatus === 'APPROVED' || attendanceStatus === 'PENDING' ? (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    className="w-full h-12 text-base"
                                                    onClick={() => navigate(`/members?edit=${selectedMember.id}`, { replace: false })}
                                                >
                                                    Update Profile
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    className="w-full h-12 text-base"
                                                    onClick={() => {
                                                        if (!attendanceTodayId) return;
                                                        if (confirm('Revert this attendance log?')) {
                                                            undoMutation.mutate(attendanceTodayId);
                                                        }
                                                    }}
                                                    disabled={undoMutation.isPending || attendanceStatus === 'PENDING'}
                                                >
                                                    {undoMutation.isPending ? 'Reverting...' : 'Revert Attendance'}
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                className="w-full h-14 text-lg bg-[#2c2a9c] hover:bg-[#241f7a] text-white"
                                                onClick={handleLogAttendance}
                                                disabled={mutation.isPending}
                                            >
                                                {mutation.isPending ? 'Processing...' : 'Log Attendance'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                                    <User className="h-12 w-12 md:h-16 md:w-16 opacity-20" />
                                    <p className="text-sm md:text-base">Select a member from the search results</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Mobile Bottom Button */}
            {selectedMember && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t shadow-lg md:hidden">
                    {attendanceStatus === 'APPROVED' || attendanceStatus === 'PENDING' ? (
                        <div className="grid grid-cols-1 gap-3">
                            <Button
                                variant="outline"
                                className="w-full h-12 text-base"
                                onClick={() => navigate(`/members?edit=${selectedMember.id}`, { replace: false })}
                            >
                                Update Profile
                            </Button>
                            <Button
                                variant="destructive"
                                className="w-full h-12 text-base"
                                onClick={() => {
                                    if (!attendanceTodayId) return;
                                    if (confirm('Revert this attendance log?')) {
                                        undoMutation.mutate(attendanceTodayId);
                                    }
                                }}
                                disabled={undoMutation.isPending || attendanceStatus === 'PENDING'}
                            >
                                {undoMutation.isPending ? 'Reverting...' : 'Revert Attendance'}
                            </Button>
                        </div>
                    ) : (
                        <Button
                            className="w-full h-14 text-lg bg-[#2c2a9c] hover:bg-[#241f7a] text-white"
                            onClick={handleLogAttendance}
                            disabled={mutation.isPending}
                        >
                            {mutation.isPending ? 'Processing...' : 'Log Attendance'}
                        </Button>
                    )}
                </div>
            )}

            {/* Warning Dialog */}
            <Dialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                            Incomplete Profile
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Required fields are missing. Proceed anyway?
                        </p>
                        <div className="bg-muted p-4 rounded-lg max-h-48 overflow-y-auto">
                            <ul className="space-y-1">
                                {missingFields.map((field) => (
                                    <li key={field.key} className="text-sm flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                        {field.label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:flex-row flex-col">
                        <Button variant="outline" onClick={() => setShowWarningDialog(false)} className="w-full sm:w-auto">Cancel</Button>
                        <Button
                            variant="secondary"
                            className="w-full sm:w-auto"
                            onClick={() => {
                                setShowWarningDialog(false);
                                navigate(`/members?edit=${selectedMember.id}`, { replace: false });
                            }}
                        >
                            Update Profile
                        </Button>
                        <Button onClick={handleProceedAnyway} className="w-full sm:w-auto">Proceed Anyway</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Quick Register Dialog */}
            <Dialog open={showQuickRegisterDialog} onOpenChange={setShowQuickRegisterDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Quick Register</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Full Name</label>
                            <Input
                                placeholder="Enter full name"
                                value={guestData.full_name}
                                onChange={(e) => setGuestData(prev => ({ ...prev, full_name: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Contact Number</label>
                            <Input
                                placeholder="Enter contact number"
                                value={guestData.contact_no}
                                onChange={(e) => setGuestData(prev => ({ ...prev, contact_no: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Branch</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={guestData.branch_id ?? user?.branch_id ?? ''}
                                onChange={(e) => setGuestData(prev => ({ ...prev, branch_id: e.target.value ? Number(e.target.value) : '' }))}
                            >
                                <option value="">Select branch</option>
                                {(branches || []).map((b: any) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <DialogFooter className="[&>button]:w-full sm:[&>button]:w-auto">
                        <Button variant="outline" onClick={() => setShowQuickRegisterDialog(false)}>Cancel</Button>
                        <Button
                            onClick={handleQuickRegister}
                            disabled={isCreatingGuest}
                            className="bg-[#2c2a9c] hover:bg-[#241f7a]"
                        >
                            {isCreatingGuest ? 'Registering...' : 'Register & Log'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PresentMemberPage;
