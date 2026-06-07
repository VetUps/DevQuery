<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { onMounted, shallowRef } from 'vue'

import AdminUserReputationDetail from '@/features/admin/components/AdminUserReputationDetail.vue'
import AdminUserSearchPanel from '@/features/admin/components/AdminUserSearchPanel.vue'
import { useAdminUserManagement } from '@/features/admin/composables/useAdminUserManagement'
import AppDialog from '@/shared/ui/AppDialog.vue'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

const adminUsers = useAdminUserManagement()
const isUserModalOpen = shallowRef(false)

function manageUser(userId: string) {
  isUserModalOpen.value = true
  void adminUsers.selectUser(userId)
}

function closeUserModal() {
  isUserModalOpen.value = false
}

onMounted(() => {
  void adminUsers.loadUsers()
})
</script>

<template>
  <div class="admin-user-management" data-testid="admin-user-management">
    <SurfacePanel padding="lg">
      <AdminUserSearchPanel
        v-model:search-text="adminUsers.searchText.value"
        :users="adminUsers.users.value"
        :selected-user-id="adminUsers.selectedUserId.value"
        :is-loading="adminUsers.isListLoading.value"
        :error="adminUsers.listError.value"
        @submit="adminUsers.loadUsers"
        @retry="adminUsers.loadUsers"
        @manage-user="manageUser"
      />
    </SurfacePanel>

    <AppDialog
      :open="isUserModalOpen"
      size="wide"
      title="Управление пользователем"
      description="Репутация, журнал и активность выбранного пользователя."
      @close="closeUserModal"
    >
      <AdminUserReputationDetail
        :selected-user="adminUsers.selectedUser.value"
        :detail="adminUsers.selectedUserDetail.value"
        :is-loading="adminUsers.isDetailLoading.value"
        :error="adminUsers.detailError.value"
        :is-override-saving="adminUsers.isOverrideSaving.value"
        :override-error="adminUsers.overrideError.value"
        :override-success="adminUsers.overrideSuccess.value"
        @retry="adminUsers.retrySelectedUser"
        @submit-manual-override="adminUsers.submitManualOverride"
      />
    </AppDialog>
  </div>
</template>

<style scoped>
.admin-user-management {
  display: grid;
  gap: var(--space-lg);
  align-items: start;
}

</style>
